#!/usr/bin/env node
/**
 * Servidor RTMP (entrada usada por el servicio de Windows "RTMP-Server").
 * La lógica vive en src/rtmp/.
 */
import { createConfig } from './src/config.js';
import { createLogger } from './src/lib/logger.js';
import { getLocalIP } from './src/lib/net.js';
import { RtmpServer } from './src/rtmp/server.js';

const config = createConfig();
const logger = createLogger({
  name: 'rtmp',
  file: config.logs.rtmpFile,
  maxBytes: config.logs.maxBytes,
  keep: config.logs.keep,
  level: process.env.LOG_LEVEL ?? 'info',
});

const ip = getLocalIP();
let server = null;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.warn(`Cerrando servidor RTMP (${signal})...`);
  try {
    await server?.stop('Servidor RTMP detenido');
  } catch (error) {
    logger.error(`Error al cerrar: ${error.message}`);
  }
  await logger.close();
  process.exit(0);
}

async function main() {
  logger.info('════════════════════════════════════════════');
  logger.info('  SERVIDOR RTMP');
  logger.info(`  RTMP:      rtmp://${ip}:${config.rtmp.port}/live/stream`);
  logger.info(`  Panel:     http://${ip}:${config.dashboard.port}`);
  logger.info(`  WebSocket: ws://${ip}:${config.dashboard.port}/ws`);
  logger.info('════════════════════════════════════════════');

  server = new RtmpServer({ config, logger });
  await server.start();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Un error no controlado no debe tumbar el streaming en curso.
process.on('uncaughtException', (error) => {
  logger.error(`Error no capturado: ${error.stack ?? error.message}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Promesa rechazada sin manejar: ${reason?.stack ?? reason}`);
});

main().catch(async (error) => {
  logger.error(`No se pudo iniciar el servidor RTMP: ${error.stack ?? error.message}`);
  await logger.close();
  process.exit(1);
});
