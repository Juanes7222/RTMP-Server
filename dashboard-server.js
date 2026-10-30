#!/usr/bin/env node
/**
 * Panel de control (entrada usada por el servicio "RTMP-Dashboard").
 * La lógica vive en src/dashboard/.
 */
import { createConfig } from './src/config.js';
import { createLogger } from './src/lib/logger.js';
import { getLocalIP } from './src/lib/net.js';
import { DashboardServer } from './src/dashboard/server.js';

const config = createConfig();
const logger = createLogger({
  name: 'dashboard',
  file: config.logs.dashboardFile,
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

  logger.warn(`Cerrando panel (${signal})...`);
  try {
    await server?.close();
  } catch (error) {
    logger.error(`Error al cerrar: ${error.message}`);
  }
  await logger.close();
  process.exit(0);
}

async function main() {
  server = new DashboardServer({ config, logger });
  await server.start();

  const { port } = server;
  logger.info('════════════════════════════════════════════');
  logger.info('  PANEL DE CONTROL');
  logger.info(`  Local:     http://localhost:${port}`);
  logger.info(`  Red:       http://${ip}:${port}`);
  logger.info(`  WebSocket: ws://${ip}:${port}/ws`);
  logger.info('════════════════════════════════════════════');
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.error(`Error no capturado: ${error.stack ?? error.message}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Promesa rechazada sin manejar: ${reason?.stack ?? reason}`);
});

main().catch(async (error) => {
  logger.error(`No se pudo iniciar el panel: ${error.stack ?? error.message}`);
  await logger.close();
  process.exit(1);
});
