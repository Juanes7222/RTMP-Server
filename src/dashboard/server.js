import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createConfig } from '../config.js';
import { DashboardState } from '../lib/state.js';
import { ServiceControl } from '../lib/service-control.js';
import { createMetricsSampler } from '../lib/metrics.js';
import { LogTailer, readTail } from '../lib/log-tail.js';
import {
  HttpError,
  SECURITY_HEADERS,
  createStaticHandler,
  isLoopback,
  isTrustedPost,
  readJson,
  sendJson,
} from '../lib/http.js';

const WS_PATH = '/ws';
const WS_PING_MS = 25_000;
const SERVICE_POLL_MS = 10_000;

/**
 * Panel de control: un solo proceso y un solo puerto para HTTP, API y
 * WebSocket (antes eran dos puertos y dos servidores).
 */
export class DashboardServer {
  #config;
  #logger;
  #state;
  #services;
  #sampler;
  #serveStatic;
  #tailer;

  #server = null;
  #wss = null;
  #clients = new Set();
  #timers = [];
  #loopsRunning = false;
  #serviceStatus = 'unknown';

  constructor({ config = createConfig(), logger } = {}) {
    this.#config = config;
    this.#logger = logger ?? {
      debug() {},
      info() {},
      success() {},
      warn() {},
      error() {},
    };

    this.#state = new DashboardState({ aliveWindow: config.metrics.rtmpAliveMs });
    this.#services = new ServiceControl({
      name: config.services.rtmp,
      cacheMs: config.services.cacheMs,
    });
    this.#sampler = createMetricsSampler();
    this.#serveStatic = createStaticHandler({ dir: config.publicDir });
    this.#tailer = new LogTailer({
      files: [config.logs.dashboardFile, config.logs.rtmpFile],
      pollMs: config.logs.pollMs,
      maxLinesPerTick: config.logs.maxLinesPerTick,
      onLines: (lines) => this.#broadcast({ type: 'logs', data: lines }),
    });

    this.#state.on('state', (state) => this.#broadcast({ type: 'state', data: state }));
    this.#state.on('metrics', (metrics) => this.#broadcast({ type: 'metrics', data: metrics }));
    this.#state.on('activity', (activity) => this.#broadcast({ type: 'activity', data: activity }));
  }

  get state() {
    return this.#state;
  }

  get port() {
    return this.#server?.address()?.port ?? this.#config.dashboard.port;
  }

  get clientCount() {
    return this.#clients.size;
  }

  async start({ port = this.#config.dashboard.port, host = this.#config.host } = {}) {
    this.#server = http.createServer((req, res) => {
      void this.#handle(req, res);
    });

    // Un cliente malicioso no debe poder colgar conexiones indefinidamente.
    this.#server.headersTimeout = 20_000;
    this.#server.requestTimeout = 30_000;
    this.#server.keepAliveTimeout = 65_000;
    this.#server.maxHeadersCount = 64;
    this.#server.on('clientError', (error, socket) => {
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      this.#logger.debug(`Petición HTTP inválida: ${error.message}`);
    });

    this.#wss = new WebSocketServer({
      server: this.#server,
      path: WS_PATH,
      maxPayload: this.#config.limits.wsPayloadBytes,
      perMessageDeflate: false,
    });

    this.#wss.on('connection', (ws) => this.#onConnection(ws));
    this.#wss.on('error', (error) => this.#logger.error(`WebSocket: ${error.message}`));

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.#server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.#server.off('error', onError);
        resolve();
      };
      this.#server.once('error', onError);
      this.#server.once('listening', onListening);
      this.#server.listen(port, host);
    });

    // Primera muestra: el estado inicial ya lleva memoria real aunque
    // todavía no haya ningún panel abierto.
    this.#state.setMetrics(this.#sampler());

    this.#state.addActivity({
      type: 'success',
      icon: 'check-circle',
      message: 'Panel de control iniciado',
    });

    return this;
  }

  async close() {
    this.#stopLoops();

    for (const client of this.#clients) client.terminate();
    this.#clients.clear();

    if (this.#wss) {
      await new Promise((resolve) => this.#wss.close(resolve));
      this.#wss = null;
    }

    if (this.#server) {
      await new Promise((resolve) => this.#server.close(resolve));
      this.#server = null;
    }
  }

  // ───────────────────────────── HTTP ─────────────────────────────

  async #handle(req, res) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

    let url;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Petición inválida');
      return;
    }

    try {
      if (url.pathname.startsWith('/api/')) {
        await this.#handleApi(req, res, url);
        return;
      }

      const served = await this.#serveStatic(req, res, url.pathname);
      if (!served) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No encontrado');
      }
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) this.#logger.error(`HTTP ${req.method} ${url.pathname}: ${error.stack ?? error.message}`);
      if (!res.headersSent) sendJson(res, status, { error: error.message });
      else res.end();
    }
  }

  async #handleApi(req, res, url) {
    const { pathname } = url;

    if (req.method === 'GET' && pathname === '/api/state') {
      sendJson(res, 200, {
        state: this.#state.snapshot(),
        service: this.#serviceStatus,
        clients: this.#clients.size,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, { ok: true, uptime: this.#state.uptime, clients: this.#clients.size });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/logs') {
      const lines = Math.min(Math.max(Number(url.searchParams.get('lines')) || 200, 1), 1000);
      sendJson(res, 200, { lines: this.#recentLogs(lines) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/service') {
      const status = await this.#refreshService({ force: url.searchParams.has('force') });
      sendJson(res, 200, { status, name: this.#config.services.rtmp });
      return;
    }

    // Endpoints internos: los usa el servidor RTMP para publicar su estado.
    if (req.method === 'POST' && (pathname === '/api/state' || pathname === '/api/activity')) {
      if (!isLoopback(req)) {
        sendJson(res, 403, { error: 'Solo accesible desde localhost' });
        return;
      }

      const body = await readJson(req, this.#config.limits.jsonBodyBytes);

      if (pathname === '/api/state') {
        this.#state.applyPatch(body);
      } else {
        this.#state.addActivity(body);
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && ['/api/start', '/api/stop', '/api/restart'].includes(pathname)) {
      if (!isTrustedPost(req)) {
        this.#logger.warn(`Petición de control rechazada desde ${req.socket.remoteAddress}`);
        sendJson(res, 403, { error: 'Origen no permitido' });
        return;
      }

      const action = pathname.slice('/api/'.length);
      const result = await this.#control(action);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'No encontrado' });
  }

  async #control(action) {
    const labels = {
      start: { verb: 'Iniciando', icon: 'play' },
      stop: { verb: 'Deteniendo', icon: 'square' },
      restart: { verb: 'Reiniciando', icon: 'rotate' },
    };
    const label = labels[action];

    this.#logger.info(`Solicitud de control: ${action}`);
    this.#state.addActivity({ type: 'info', icon: label.icon, message: `${label.verb} RTMP Server...` });

    if (action === 'restart') {
      this.#state.applyPatch({ status: 'starting', lastEvent: 'Reiniciando servidor RTMP...' }, { markAlive: false });
    }

    const result = await this.#services[action]();
    this.#serviceStatus = result.status ?? (await this.#services.status({ force: true }));

    if (result.success) {
      if (action === 'stop') this.#state.markStopped('Servidor RTMP detenido manualmente');
      this.#state.addActivity({
        type: 'success',
        icon: 'check-circle',
        message: `RTMP Server: ${result.message}`,
      });
    } else {
      this.#state.addError(result.message);
      this.#state.addActivity({
        type: 'error',
        icon: 'alert-circle',
        message: `Error en RTMP Server: ${result.message}`,
      });
    }

    this.#broadcast({ type: 'service', data: { status: this.#serviceStatus } });
    return { ...result, service: this.#serviceStatus };
  }

  async #refreshService({ force = false } = {}) {
    try {
      const status = await this.#services.status({ force });
      if (status !== this.#serviceStatus) {
        this.#serviceStatus = status;
        this.#broadcast({ type: 'service', data: { status } });
      }
      return status;
    } catch (error) {
      this.#logger.warn(`No se pudo consultar el servicio: ${error.message}`);
      return this.#serviceStatus;
    }
  }

  #recentLogs(limit) {
    const lines = [
      ...readTail(this.#config.logs.dashboardFile, limit),
      ...readTail(this.#config.logs.rtmpFile, limit),
    ];

    const stamp = (line) => /^\[([^\]]+)\]/.exec(line)?.[1] ?? '';
    lines.sort((a, b) => stamp(a).localeCompare(stamp(b)));
    return lines.slice(-limit);
  }

  // ─────────────────────────── WebSocket ───────────────────────────

  #onConnection(ws) {
    this.#clients.add(ws);
    ws.isAlive = true;
    this.#logger.debug(`Cliente WebSocket conectado (${this.#clients.size})`);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      if (raw.length > 512) return;
      try {
        const message = JSON.parse(raw.toString());
        if (message?.type === 'refresh') void this.#sendHello(ws);
      } catch {
        // Los clientes solo envían mensajes pequeños; se ignoran los inválidos.
      }
    });

    ws.on('close', () => this.#onDisconnect(ws));
    ws.on('error', () => this.#onDisconnect(ws));

    this.#startLoops();
    void this.#sendHello(ws);
  }

  #onDisconnect(ws) {
    this.#clients.delete(ws);
    if (this.#clients.size === 0) this.#stopLoops();
  }

  async #sendHello(ws) {
    // El saludo debe salir antes de cualquier broadcast: si se consultara el
    // servicio primero, el evento 'service' podía llegar antes que el estado.
    this.#send(ws, {
      type: 'hello',
      data: {
        state: this.#state.snapshot(),
        logs: this.#recentLogs(this.#config.logs.initialLines),
        service: { status: this.#serviceStatus, name: this.#config.services.rtmp },
        meta: { rtmpPort: this.#config.rtmp.port, dashboardPort: this.port },
      },
    });

    void this.#refreshService();
  }

  #send(ws, message) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(message));
  }

  #broadcast(message) {
    if (this.#clients.size === 0) return;
    const payload = JSON.stringify(message);
    for (const client of this.#clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }

  // ───────────────────────────── Loops ─────────────────────────────

  /**
   * Los bucles de métricas y logs solo corren cuando hay clientes conectados:
   * sin panel abierto el proceso queda prácticamente inactivo.
   */
  #startLoops() {
    if (this.#loopsRunning) return;
    this.#loopsRunning = true;

    this.#tailer.start();

    const metricsTimer = setInterval(() => {
      const base = this.#sampler();
      const { stream } = this.#state.raw;
      const fresh = Date.now() - stream.updatedAt < this.#config.metrics.streamStaleMs;

      this.#state.setMetrics({
        ...base,
        bitrate: fresh ? stream.bitrateKbps / 1000 : 0,
      });
    }, this.#config.metrics.intervalMs);

    const serviceTimer = setInterval(() => void this.#refreshService({ force: true }), SERVICE_POLL_MS);

    const pingTimer = setInterval(() => {
      for (const client of this.#clients) {
        if (!client.isAlive) {
          client.terminate();
          this.#clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
      if (this.#clients.size === 0) this.#stopLoops();
    }, WS_PING_MS);

    for (const timer of [metricsTimer, serviceTimer, pingTimer]) timer.unref?.();
    this.#timers.push(metricsTimer, serviceTimer, pingTimer);
  }

  #stopLoops() {
    if (!this.#loopsRunning) return;
    this.#loopsRunning = false;
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [];
    this.#tailer.stop();
  }
}
