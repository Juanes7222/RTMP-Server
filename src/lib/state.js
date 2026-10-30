import { EventEmitter } from 'node:events';

const ACTIVITY_LIMIT = 50;
const ERROR_LIMIT = 10;
const TEXT_LIMIT = 300;

const STATUSES = new Set([
  'starting',
  'waiting_camera',
  'camera_only',
  'obs_waiting_camera',
  'streaming',
  'error',
  'stopped',
]);

function cleanText(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text ? text.slice(0, TEXT_LIMIT) : fallback;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

/**
 * Fuente única de verdad del panel. Los módulos nunca tocan el objeto crudo:
 * se actualiza por parches validados y se emiten eventos.
 */
export class DashboardState extends EventEmitter {
  #data;
  #startedAt;

  constructor({ startedAt = Date.now(), aliveWindow = 30_000 } = {}) {
    super();
    this.#startedAt = startedAt;
    this.aliveWindow = aliveWindow;
    this.#data = {
      status: 'starting',
      lastEvent: 'Iniciando panel...',
      lastEventTime: new Date(startedAt).toISOString(),
      cameraConnected: false,
      cameraIP: null,
      obsConnected: false,
      obsIP: null,
      players: 0,
      stream: {
        bitrateKbps: 0,
        width: 0,
        height: 0,
        fps: 0,
        videoCodec: null,
        audioCodec: null,
        updatedAt: 0,
      },
      metrics: {
        uptime: 0,
        cpu: 0,
        memoryMB: 0,
        memoryTotalMB: 0,
        memoryPercent: 0,
        processRssMB: 0,
        bitrate: 0,
      },
      rtmp: { alive: false, lastPushAt: 0 },
      activities: [],
      errors: [],
    };
  }

  get startedAt() {
    return this.#startedAt;
  }

  get uptime() {
    return Math.floor((Date.now() - this.#startedAt) / 1000);
  }

  get raw() {
    return this.#data;
  }

  snapshot() {
    return {
      ...this.#data,
      uptime: this.uptime,
      activities: [...this.#data.activities],
      errors: [...this.#data.errors],
      stream: { ...this.#data.stream },
      metrics: { ...this.#data.metrics },
      rtmp: { ...this.#data.rtmp },
    };
  }

  /**
   * Aplica un parche de estado proveniente del servidor RTMP (o interno).
   * Solo se aceptan claves conocidas y valores con el tipo correcto.
   */
  applyPatch(patch = {}, { markAlive = true } = {}) {
    if (!patch || typeof patch !== 'object') return this.snapshot();
    const data = this.#data;

    const statusKnown = typeof patch.status === 'string' && STATUSES.has(patch.status);
    if (statusKnown) data.status = patch.status;

    // El latido del RTMP solo trae el estado resumido. Sin esto, reiniciar el
    // panel dejaba «EN AIRE» con la cámara y OBS en «sin conexión» hasta el
    // siguiente evento de conexión, que puede no ocurrir en horas.
    if (statusKnown && typeof patch.cameraConnected !== 'boolean') {
      data.cameraConnected = patch.status === 'camera_only' || patch.status === 'streaming';
      if (!data.cameraConnected) data.cameraIP = null;
    }
    if (statusKnown && typeof patch.obsConnected !== 'boolean') {
      data.obsConnected = patch.status === 'obs_waiting_camera' || patch.status === 'streaming';
      if (!data.obsConnected) data.obsIP = null;
    }

    if (typeof patch.cameraConnected === 'boolean') data.cameraConnected = patch.cameraConnected;
    if (typeof patch.obsConnected === 'boolean') data.obsConnected = patch.obsConnected;

    if ('cameraIP' in patch) data.cameraIP = cleanText(patch.cameraIP);
    if ('obsIP' in patch) data.obsIP = cleanText(patch.obsIP);

    if (patch.lastEvent !== undefined) data.lastEvent = cleanText(patch.lastEvent, data.lastEvent);
    if (patch.lastEventTime !== undefined) {
      const time = new Date(patch.lastEventTime);
      if (!Number.isNaN(time.getTime())) data.lastEventTime = time.toISOString();
    }

    if (patch.players !== undefined) data.players = Math.round(toNumber(patch.players));

    if (patch.stream && typeof patch.stream === 'object') {
      const stream = patch.stream;
      data.stream = {
        bitrateKbps: toNumber(stream.bitrateKbps, data.stream.bitrateKbps),
        width: Math.round(toNumber(stream.width)),
        height: Math.round(toNumber(stream.height)),
        fps: Math.round(toNumber(stream.fps)),
        videoCodec: cleanText(stream.videoCodec, null),
        audioCodec: cleanText(stream.audioCodec, null),
        updatedAt: Date.now(),
      };
    }

    // Los cambios aplicados por el propio panel no prueban que el servidor
    // RTMP siga vivo; solo sus peticiones cuentan para el latido.
    if (markAlive) data.rtmp = { alive: true, lastPushAt: Date.now() };

    const snapshot = this.snapshot();
    this.emit('state', snapshot);
    return snapshot;
  }

  setMetrics(metrics = {}) {
    this.#data.metrics = {
      ...this.#data.metrics,
      uptime: this.uptime,
      cpu: toNumber(metrics.cpu),
      memoryMB: Math.round(toNumber(metrics.memoryMB)),
      memoryTotalMB: Math.round(toNumber(metrics.memoryTotalMB)),
      memoryPercent: toNumber(metrics.memoryPercent),
      processRssMB: Math.round(toNumber(metrics.processRssMB)),
      bitrate: toNumber(metrics.bitrate),
    };

    const alive = Date.now() - this.#data.rtmp.lastPushAt < this.aliveWindow;
    if (this.#data.rtmp.alive !== alive) {
      this.#data.rtmp = { ...this.#data.rtmp, alive };
      // Si el servidor RTMP dejó de reportar, el estado no puede seguir
      // mostrando una transmisión que ya no existe.
      if (alive) this.emit('state', this.snapshot());
      else this.markStopped('Sin respuesta del servidor RTMP');
    }

    this.emit('metrics', { ...this.#data.metrics, sampledAt: metrics.sampledAt ?? Date.now() });
    return this.#data.metrics;
  }

  /** Deja el estado en reposo (servicio detenido o sin respuesta). */
  markStopped(reason = 'Servidor RTMP detenido') {
    const data = this.#data;
    data.status = 'stopped';
    data.cameraConnected = false;
    data.obsConnected = false;
    data.cameraIP = null;
    data.obsIP = null;
    data.players = 0;
    data.stream = {
      bitrateKbps: 0,
      width: 0,
      height: 0,
      fps: 0,
      videoCodec: null,
      audioCodec: null,
      updatedAt: Date.now(),
    };
    data.rtmp = { alive: false, lastPushAt: data.rtmp.lastPushAt };
    data.lastEvent = cleanText(reason, 'Servidor RTMP detenido');
    data.lastEventTime = new Date().toISOString();

    const snapshot = this.snapshot();
    this.emit('state', snapshot);
    return snapshot;
  }

  addActivity(activity = {}) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: ['info', 'success', 'warning', 'error'].includes(activity.type) ? activity.type : 'info',
      icon: cleanText(activity.icon, 'activity'),
      message: cleanText(activity.message, 'Sin descripción'),
      timestamp: new Date().toISOString(),
    };

    this.#data.activities.unshift(entry);
    if (this.#data.activities.length > ACTIVITY_LIMIT) {
      this.#data.activities.length = ACTIVITY_LIMIT;
    }

    this.emit('activity', entry);
    return entry;
  }

  addError(message) {
    const entry = { message: cleanText(message, 'Error desconocido'), timestamp: new Date().toISOString() };
    this.#data.errors.push(entry);
    if (this.#data.errors.length > ERROR_LIMIT) this.#data.errors.shift();
    return entry;
  }
}
