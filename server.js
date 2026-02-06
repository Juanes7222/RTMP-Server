import { getLocalIP } from './utils.js';
import NodeMediaServer from 'node-media-server';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { renderStatusPage } from './status.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, 'logs', 'app.log');

// Estado en tiempo real del servidor
const serverState = {
  status: 'starting',
  lastEvent: 'Iniciando servidor...',
  lastEventTime: new Date(),
  cameraConnected: false,
  cameraIP: null,
  obsConnected: false,
  obsIP: null,
  startTime: new Date(),
  errors: []
};

function writeLog(level, message) {
  const date = new Date().toISOString();
  const line = `[${date}] [${level}] ${message}\n`;
  // Consola (WinSW lo captura)
  console.log(line.trim());
  // Archivo
  fs.appendFile(LOG_FILE, line, () => {});
}

function info(msg) {
  writeLog('INFO', msg);
}

function warn(msg) {
  writeLog('WARN', msg);
}

function error(msg) {
  writeLog('ERROR', msg);
}

const ip = getLocalIP();
info(`Local IP: ${ip}`);

const httpConfig = {
  port: 8000,
  allow_origin: "*",
  mediaroot: "./media",
};

const rtmpConfig = {
  port: 1935,
  chunk_size: 4096,  // Tamaño de chunk RTMP estándar (mejor rendimiento)
  gop_cache: true,
  ping: 30,
  ping_timeout: 60,
  // Mejoras para estabilidad con OBS
  rtmp_auto_push: false,
  rtmp_auto_pull: false,
};

const config = {
  // http: httpConfig,
  rtmp: rtmpConfig,
  logType: 3,
};

const nms = new NodeMediaServer(config);

// Servidor HTTP simple para el visor de estado
import http from 'http';

const statusServer = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderStatusPage(serverState));
  } else {
    res.writeHead(404);
    res.end('No encontrado');
  }
});

statusServer.listen(8001, () => {
  info('Visor web disponible en /status (puerto 8001)');
});


// Evento de conexión
nms.on("preConnect", (id, args) => {
  info(`[NodeEvent on preConnect] id=${id} args=${JSON.stringify(args)}`);
});

nms.on("postConnect", (id, args) => {
  info(`[NodeEvent on postConnect] id=${id} args=${JSON.stringify(args)}`);
});

nms.on("doneConnect", (id, args) => {
  info(`[NodeEvent on doneConnect] id=${id} args=${JSON.stringify(args)}`);
});

// Eventos de publicación (cuando la cámara envía el stream)
nms.on("prePublish", (session) => {
  info(`[NodeEvent on prePublish] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
  
  // Aquí puedes agregar autenticación si lo necesitas
  // if (!authorized) {
  //   session.reject();
  // }
});

nms.on("postPublish", (session) => {
  info(`[NodeEvent on postPublish] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
  info("Camara conectada y transmitiendo");
  
  serverState.cameraConnected = true;
  serverState.cameraIP = session.ip;
  serverState.lastEvent = `Cámara conectada desde ${session.ip}`;
  serverState.lastEventTime = new Date();
  serverState.status = serverState.obsConnected ? 'streaming' : 'camera_only';
});

nms.on("donePublish", (session) => {
  info(`[NodeEvent on donePublish] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
  info("Camara desconectada");
  
  serverState.cameraConnected = false;
  serverState.cameraIP = null;
  serverState.lastEvent = `Cámara desconectada (${session.ip})`;
  serverState.lastEventTime = new Date();
  serverState.status = 'waiting_camera';
});

// Eventos de reproducción (cuando OBS recibe el stream)
nms.on("prePlay", (session) => {
  info(`[NodeEvent on prePlay] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
  
  // Verificar si hay un publisher activo
  if (!session.broadcast?.publisher) {
    warn("No hay stream publicado aun, el cliente intentara reconectar");
  }
});

nms.on("postPlay", (session) => {
  info(`[NodeEvent on postPlay] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
  
  serverState.obsConnected = true;
  serverState.obsIP = session.ip;
  serverState.lastEvent = `OBS conectado desde ${session.ip}`;
  serverState.lastEventTime = new Date();
  serverState.status = serverState.cameraConnected ? 'streaming' : 'obs_waiting_camera';
});

nms.on("donePlay", (session) => {
  info(`[NodeEvent on donePlay] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
  
  serverState.obsConnected = false;
  serverState.obsIP = null;
  serverState.lastEvent = `OBS desconectado (${session.ip})`;
  serverState.lastEventTime = new Date();
  serverState.status = serverState.cameraConnected ? 'camera_only' : 'waiting_camera';
});

// Manejo de errores
process.on('uncaughtException', (err) => {
  error(`Error no capturado: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
  error(`Promesa rechazada no manejada: ${reason}`);
});

info("Iniciando servidor RTMP...");
info(`URL de streaming: rtmp://${ip}:1935/live/stream`);
info(`URL HTTP: http://${ip}:8000`);

nms.run();

// Actualizar estado después de iniciar
setTimeout(() => {
  serverState.status = 'waiting_camera';
  serverState.lastEvent = 'Servidor iniciado correctamente';
  serverState.lastEventTime = new Date();
  info('Servidor listo, esperando conexiones...');
}, 1000);