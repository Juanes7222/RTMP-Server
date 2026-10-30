import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function toInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPort(value, fallback) {
  const port = toInt(value, fallback);
  return port > 0 && port <= 65535 ? port : fallback;
}

/**
 * Configuración única del sistema. Todos los módulos leen de aquí para no
 * repetir puertos, rutas ni nombres de servicio.
 */
export function createConfig(overrides = {}) {
  const logDir = overrides.logDir ?? path.join(ROOT, 'logs');

  const base = {
    root: ROOT,
    publicDir: path.join(ROOT, 'public'),
    logDir,
    mediaDir: path.join(ROOT, 'media'),
    host: process.env.HOST ?? '0.0.0.0',

    dashboard: {
      port: toPort(process.env.DASHBOARD_PORT, 8001),
      // Usado por el servidor RTMP para enviar su estado al panel.
      internalUrl: process.env.DASHBOARD_URL ?? 'http://127.0.0.1:8001',
      heartbeatMs: toInt(process.env.HEARTBEAT_MS, 10_000),
    },

    rtmp: {
      port: toPort(process.env.RTMP_PORT, 1935),
      // chunk size, GOP cache y ping los gestiona NodeMediaServer v4.
      // Si se define, exige ?sign=<exp>-<md5> al publicar.
      streamKey: process.env.STREAM_KEY ?? '',
    },

    metrics: {
      intervalMs: toInt(process.env.METRICS_INTERVAL_MS, 2000),
      // Si el servidor RTMP deja de reportar, su bitrate se considera 0.
      streamStaleMs: toInt(process.env.STREAM_STALE_MS, 8000),
      rtmpAliveMs: toInt(process.env.RTMP_ALIVE_MS, 30_000),
    },

    logs: {
      pollMs: toInt(process.env.LOG_POLL_MS, 1000),
      maxBytes: toInt(process.env.LOG_MAX_BYTES, 5 * 1024 * 1024),
      keep: toInt(process.env.LOG_KEEP, 5),
      initialLines: toInt(process.env.LOG_INITIAL_LINES, 200),
      maxLinesPerTick: toInt(process.env.LOG_LINES_PER_TICK, 200),
      dashboardFile: path.join(logDir, 'dashboard.log'),
      rtmpFile: path.join(logDir, 'rtmp.log'),
    },

    services: {
      rtmp: process.env.RTMP_SERVICE ?? 'RTMP-Server',
      dashboard: process.env.DASHBOARD_SERVICE ?? 'RTMP-Dashboard',
      cacheMs: toInt(process.env.SERVICE_CACHE_MS, 2000),
    },

    limits: {
      jsonBodyBytes: toInt(process.env.JSON_BODY_BYTES, 64 * 1024),
      wsPayloadBytes: 4096,
    },
  };

  return {
    ...base,
    ...overrides,
    dashboard: { ...base.dashboard, ...overrides.dashboard },
    rtmp: { ...base.rtmp, ...overrides.rtmp },
    metrics: { ...base.metrics, ...overrides.metrics },
    logs: { ...base.logs, ...overrides.logs },
    services: { ...base.services, ...overrides.services },
    limits: { ...base.limits, ...overrides.limits },
  };
}

export const config = createConfig();
