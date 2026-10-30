import http from 'node:http';
import { createRequire } from 'node:module';
import NodeMediaServer from 'node-media-server';
import { createConfig } from '../config.js';
import { createFrameRateMeter } from '../lib/fps.js';

const require = createRequire(import.meta.url);

/**
 * NodeMediaServer v4 fija su logger en `debug` e ignora `logType`, lo que
 * llenaba el archivo del servicio. Si el módulo expone su logger, bajamos el
 * nivel; si no, se mantiene el comportamiento por defecto.
 */
function quietenNmsLogger() {
  try {
    require('node-media-server/src/core/logger.js').level = 'error';
  } catch {
    // Versión distinta del paquete: no hacemos nada.
  }
}

function stripPort(address) {
  if (typeof address !== 'string') return null;
  const ipv4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(address.trim());
  return ipv4 ? ipv4[1] : address.trim();
}

// Identificadores de códec de FLV, los que llegan en los metadatos del stream.
const VIDEO_CODECS = { 2: 'H.263', 4: 'VP6', 7: 'H.264', 12: 'H.265', 13: 'AV1' };
const AUDIO_CODECS = { 1: 'ADPCM', 2: 'MP3', 10: 'AAC', 11: 'Speex' };

function codecLabel(table, value) {
  if (value === null || value === undefined || value === '') return null;
  const id = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (Number.isFinite(id) && table[id]) return table[id];
  return typeof value === 'string' ? value.slice(0, 24) : `Códec ${value}`;
}

/** Puente HTTP hacia el panel, con keep-alive para no abrir un socket por evento. */
class DashboardBridge {
  #url;
  #agent;
  #logger;
  #down = false;

  constructor({ url, logger }) {
    this.#url = new URL(url);
    this.#logger = logger;
    this.#agent = new http.Agent({ keepAlive: true, maxSockets: 2, timeout: 5000 });
  }

  post(path, payload) {
    return new Promise((resolve) => {
      const body = JSON.stringify(payload);
      const request = http.request(
        {
          hostname: this.#url.hostname,
          port: this.#url.port || 80,
          path,
          method: 'POST',
          agent: this.#agent,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => {
            if (this.#down) {
              this.#down = false;
              this.#logger.success('Panel de control reconectado');
            }
            resolve(response.statusCode ?? 0);
          });
        },
      );

      request.setTimeout(2000, () => request.destroy(new Error('tiempo de espera agotado')));
      request.on('error', (error) => {
        if (!this.#down) {
          this.#down = true;
          this.#logger.warn(`Panel no disponible (${error.message}); el streaming continúa.`);
        }
        resolve(0);
      });

      request.end(body);
    });
  }

  close() {
    this.#agent.destroy();
  }
}

/**
 * Servidor RTMP. Publica eventos y estadísticas reales del stream al panel.
 */
export class RtmpServer {
  #config;
  #logger;
  #bridge;
  #nms = null;
  #publisher = null;
  #players = new Map();

  #bitrateSample = null;
  #bitrateKbps = 0;

  #frames = createFrameRateMeter();
  #measuredFps = null;
  #hookedBroadcasts = new WeakSet();

  #tickTimer = null;
  #heartbeatTimer = null;

  constructor({ config = createConfig(), logger } = {}) {
    this.#config = config;
    this.#logger = logger ?? { debug() {}, info() {}, success() {}, warn() {}, error() {} };
    this.#bridge = new DashboardBridge({ url: config.dashboard.internalUrl, logger: this.#logger });
  }

  get bitrateKbps() {
    return this.#bitrateKbps;
  }

  async start() {
    const { rtmp } = this.#config;

    this.#nms = new NodeMediaServer({
      bind: this.#config.host,
      rtmp: { port: rtmp.port },
      // NodeMediaServer valida las firmas de publicación si hay secreto.
      auth: rtmp.streamKey ? { publish: true, play: false, secret: rtmp.streamKey } : undefined,
    });

    // El constructor de NodeMediaServer fuerza su logger a 'debug', así que
    // el nivel se ajusta después de crearlo (y antes de aceptar conexiones).
    quietenNmsLogger();
    this.#tuneSockets();

    this.#registerEvents();
    this.#nms.run();

    this.#publish({
      status: 'waiting_camera',
      lastEvent: 'Servidor iniciado, esperando conexiones',
      lastEventTime: new Date().toISOString(),
    });

    this.#logger.success(`Servidor RTMP escuchando en el puerto ${rtmp.port}`);
    return this;
  }

  async stop(reason = 'Servidor RTMP detenido') {
    clearInterval(this.#tickTimer);
    clearInterval(this.#heartbeatTimer);
    this.#tickTimer = null;
    this.#heartbeatTimer = null;

    await this.#publish({
      status: 'stopped',
      cameraConnected: false,
      obsConnected: false,
      cameraIP: null,
      obsIP: null,
      players: 0,
      lastEvent: reason,
      lastEventTime: new Date().toISOString(),
    });

    this.#bridge.close();
    this.#logger.warn(reason);
  }

  #registerEvents() {
    const nms = this.#nms;

    nms.on('postPublish', (session) => {
      this.#publisher = session;
      this.#bitrateSample = null;
      this.#bitrateKbps = 0;
      this.#measuredFps = null;
      this.#frames.reset();
      this.#hookFrames(session);
      const ip = stripPort(session.ip);

      this.#logger.success(`Cámara conectada y transmitiendo desde ${ip} (${session.streamPath})`);
      this.#publish({
        ...this.#basics(),
        cameraConnected: true,
        cameraIP: ip,
        lastEvent: `Cámara conectada desde ${ip}`,
        lastEventTime: new Date().toISOString(),
      });
      void this.#pushActivity({
        type: 'success',
        icon: 'video',
        message: `Cámara conectada desde ${ip}`,
      });

      this.#startSampling();
    });

    nms.on('donePublish', (session) => {
      const ip = stripPort(session.ip);
      this.#publisher = null;
      this.#bitrateSample = null;
      this.#bitrateKbps = 0;
      this.#measuredFps = null;
      this.#frames.reset();

      this.#logger.warn(`Cámara desconectada (${ip})`);
      this.#publish({
        ...this.#basics(),
        cameraConnected: false,
        cameraIP: null,
        lastEvent: `Cámara desconectada (${ip})`,
        lastEventTime: new Date().toISOString(),
        stream: this.#streamSnapshot(),
      });
      void this.#pushActivity({
        type: 'warning',
        icon: 'wifi-off',
        message: `Cámara desconectada (${ip})`,
      });
    });

    nms.on('postPlay', (session) => {
      const ip = stripPort(session.ip);
      this.#players.set(session.id, ip);

      this.#logger.success(`OBS conectado desde ${ip}`);
      this.#publish({
        ...this.#basics(),
        obsConnected: true,
        obsIP: ip,
        lastEvent: `OBS conectado desde ${ip}`,
        lastEventTime: new Date().toISOString(),
      });
      void this.#pushActivity({
        type: 'success',
        icon: 'monitor',
        message: `OBS conectado desde ${ip}`,
      });

      this.#startSampling();
    });

    nms.on('donePlay', (session) => {
      const ip = this.#players.get(session.id) ?? stripPort(session.ip);
      this.#players.delete(session.id);

      this.#logger.warn(`OBS desconectado (${ip})`);
      this.#publish({
        ...this.#basics(),
        obsConnected: false,
        obsIP: null,
        lastEvent: `OBS desconectado (${ip})`,
        lastEventTime: new Date().toISOString(),
      });
      void this.#pushActivity({
        type: 'warning',
        icon: 'wifi-off',
        message: `OBS desconectado (${ip})`,
      });
    });

    nms.on('prePlay', (session) => {
      if (!session.broadcast?.publisher) {
        this.#logger.info('Reproductor conectado sin stream publicado; reintentará.');
      }
    });
  }

  /** Estado base recalculado a partir de las sesiones activas. */
  #basics() {
    const hasPublisher = Boolean(this.#publisher);
    const hasPlayers = this.#players.size > 0;

    let status = 'waiting_camera';
    if (hasPublisher && hasPlayers) status = 'streaming';
    else if (hasPublisher) status = 'camera_only';
    else if (hasPlayers) status = 'obs_waiting_camera';

    const cameraIP = hasPublisher ? stripPort(this.#publisher?.ip) : null;
    const obsIP = hasPlayers ? [...this.#players.values()][0] : null;

    return {
      status,
      players: this.#players.size,
      // Van en cada latido para que el panel se recupere solo si se reinicia.
      cameraConnected: hasPublisher,
      cameraIP,
      obsConnected: hasPlayers,
      obsIP,
      stream: this.#streamSnapshot(),
    };
  }

  #streamSnapshot() {
    const publisher = this.#publisher;
    return {
      bitrateKbps: this.#bitrateKbps,
      width: publisher?.videoWidth ?? 0,
      height: publisher?.videoHeight ?? 0,
      // Los fps medidos mandan; los metadatos solo sirven hasta la 1.ª muestra.
      fps: this.#measuredFps ?? Math.round(Number(publisher?.videoFramerate) || 0),
      videoCodec: codecLabel(VIDEO_CODECS, publisher?.videoCodec),
      audioCodec: codecLabel(AUDIO_CODECS, publisher?.audioCodec),
    };
  }

  /**
   * NMS no activa TCP_NODELAY ni keep-alive en el socket RTMP. Sin NODELAY,
   * Nagle puede retener paquetes pequeños (audio) hasta ~40 ms.
   */
  #tuneSockets() {
    const tcpServer = this.#nms?.rtmpServer?.tcpServer;
    if (!tcpServer) return;

    tcpServer.on('connection', (socket) => {
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 5000);
    });
  }

  /**
   * Cuenta fotogramas de video (flags 3 = clave, 4 = inter) envolviendo el
   * despachador del broadcast: NMS no emite un evento por paquete.
   */
  #hookFrames(session) {
    const broadcast = session?.broadcast;
    if (!broadcast || typeof broadcast.broadcastMessage !== 'function') return;
    if (this.#hookedBroadcasts.has(broadcast)) return;

    const meter = this.#frames;
    const original = broadcast.broadcastMessage;

    broadcast.broadcastMessage = (packet) => {
      if (packet?.flags === 3 || packet?.flags === 4) meter.count();
      return original.call(broadcast, packet);
    };

    this.#hookedBroadcasts.add(broadcast);
  }

  /**
   * Muestreo del bitrate real: bytes recibidos del publicador por segundo.
   * Es la estadística que antes se inventaba con Math.random().
   */
  #startSampling() {
    if (this.#tickTimer) return;

    this.#tickTimer = setInterval(() => {
      const publisher = this.#publisher;
      if (!publisher) return;

      const bytes = publisher.inBytes || publisher.socket?.bytesRead || 0;
      const now = Date.now();
      const previous = this.#bitrateSample;

      if (previous && now > previous.at) {
        const seconds = (now - previous.at) / 1000;
        const delta = bytes - previous.bytes;
        if (delta >= 0) this.#bitrateKbps = Math.round((delta * 8) / 1000 / seconds);
      }

      this.#bitrateSample = { at: now, bytes };
      this.#measuredFps = this.#frames.sample(now);
      this.#logger.debug(`Rendimiento: ${this.#bitrateKbps} kbps, ${this.#measuredFps} fps`);
      this.#publish({ ...this.#basics() });
    }, this.#config.metrics.intervalMs);

    this.#tickTimer.unref?.();

    if (!this.#heartbeatTimer) {
      this.#heartbeatTimer = setInterval(() => {
        if (this.#publisher || this.#players.size > 0) this.#publish({ ...this.#basics() });
      }, this.#config.dashboard.heartbeatMs);
      this.#heartbeatTimer.unref?.();
    }
  }

  #publish(patch) {
    return this.#bridge.post('/api/state', patch);
  }

  #pushActivity(activity) {
    return this.#bridge.post('/api/activity', activity);
  }
}
