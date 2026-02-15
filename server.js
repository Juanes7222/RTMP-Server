import { getLocalIP } from './utils.js';
import NodeMediaServer from 'node-media-server';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, 'logs', 'app.log');

// Asegurar que existe el directorio de logs
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
  fs.mkdirSync(path.join(__dirname, 'logs'));
}

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
  metrics: {
    uptime: 0,
    bitrate: 0,
    droppedFrames: 0,
    cpu: 0,
    memory: 0
  },
  activities: [],
  errors: []
};

// Configuración del Dashboard Server
const DASHBOARD_HOST = 'localhost';
const DASHBOARD_PORT = 8001;

// Sistema de logging mejorado
function writeLog(level, message) {
  const date = new Date().toISOString();
  const line = `[${date}] [${level}] ${message}\n`;
  
  // Consola con color
  const colors = {
    INFO: '\x1b[36m',    // Cyan
    WARN: '\x1b[33m',    // Yellow
    ERROR: '\x1b[31m',   // Red
    SUCCESS: '\x1b[32m', // Green
  };
  const reset = '\x1b[0m';
  const color = colors[level] || '';
  console.log(`${color}${line.trim()}${reset}`);
  
  // Archivo
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Error escribiendo log:', err);
    }
  });
}

function info(msg) {
  writeLog('INFO', msg);
}

function warn(msg) {
  writeLog('WARN', msg);
}

function error(msg) {
  writeLog('ERROR', msg);
  serverState.errors.push({
    message: msg,
    timestamp: new Date()
  });
  // Mantener solo los últimos 10 errores
  if (serverState.errors.length > 10) {
    serverState.errors.shift();
  }
}

function success(msg) {
  writeLog('SUCCESS', msg);
}

const ip = getLocalIP();
info(` Local IP: ${ip}`);

// Funciones para comunicarse con el Dashboard Server
function sendToDashboard(endpoint, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: DASHBOARD_HOST,
      port: DASHBOARD_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 2000 // 2 segundos timeout
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data: responseData });
      });
    });

    req.on('error', (err) => {
      // Dashboard no disponible, ignorar silenciosamente
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Dashboard timeout'));
    });

    req.write(postData);
    req.end();
  });
}

function updateServerState(state) {
  sendToDashboard('/api/state', state)
    .catch(() => {
      // Dashboard no disponible, continuar normalmente
    });
}

function addActivity(activity) {
  sendToDashboard('/api/activity', activity)
    .catch(() => {
      // Dashboard no disponible, continuar normalmente
    });
}

// Configuración del servidor RTMP
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
  rtmp: rtmpConfig,
  logType: 3, // 0: debug, 1: error, 2: fatal, 3: none
};

// Inicializar NodeMediaServer
const nms = new NodeMediaServer(config);

// Función para ejecutar comandos del servicio de Windows (si aplica)
async function executeServiceCommand(action) {
  const serviceName = 'RTMP-Server'; // Ajusta el nombre del servicio si es diferente
  let command = '';
  
  switch(action) {
    case 'restart':
      command = `powershell -Command "Restart-Service -Name '${serviceName}' -Force"`;
      break;
    case 'stop':
      command = `powershell -Command "Stop-Service -Name '${serviceName}' -Force"`;
      break;
    case 'start':
      command = `powershell -Command "Start-Service -Name '${serviceName}'"`;
      break;
    default:
      throw new Error('Acción no válida');
  }
  
  try {
    const { stdout, stderr } = await execPromise(command);
    return { success: true, message: stdout || 'Comando ejecutado correctamente' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Configurar eventos de Node Media Server
function setupNodeMediaEvents() {
  if (!nms) return;
  
  // Evento de conexión
  nms.on("preConnect", (id, args) => {
    info(`[preConnect] id=${id} args=${JSON.stringify(args)}`);
  });

  nms.on("postConnect", (id, args) => {
    info(`[postConnect] id=${id} args=${JSON.stringify(args)}`);
  });

  nms.on("doneConnect", (id, args) => {
    info(`[doneConnect] id=${id} args=${JSON.stringify(args)}`);
  });

  // Eventos de publicación (cuando la cámara envía el stream)
  nms.on("prePublish", (session) => {
    info(`[prePublish] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
    
    // Aquí puedes agregar autenticación si lo necesitas
    // const streamKey = session.streamPath.split('/').pop();
    // if (streamKey !== 'tu-clave-secreta') {
    //   session.reject();
    //   warn(`Stream rechazado: clave inválida`);
    // }
  });

  nms.on("postPublish", (session) => {
    info(`[postPublish] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
    success(` Cámara conectada y transmitiendo desde ${session.ip}`);
    
    serverState.cameraConnected = true;
    serverState.cameraIP = session.ip;
    serverState.lastEvent = `Cámara conectada desde ${session.ip}`;
    serverState.lastEventTime = new Date();
    serverState.status = serverState.obsConnected ? 'streaming' : 'camera_only';
    
    // Notificar a WebSocket
    updateServerState(serverState);
    
    // Agregar actividad
    addActivity({
      type: 'success',
      icon: 'video',
      message: `Cámara conectada desde ${session.ip}`
    });
  });

  nms.on("donePublish", (session) => {
    info(`[donePublish] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
    warn(` Cámara desconectada (${session.ip})`);
    
    serverState.cameraConnected = false;
    serverState.cameraIP = null;
    serverState.lastEvent = `Cámara desconectada (${session.ip})`;
    serverState.lastEventTime = new Date();
    serverState.status = serverState.obsConnected ? 'obs_waiting_camera' : 'waiting_camera';
    
    // Notificar a WebSocket
    updateServerState(serverState);
    
    // Agregar actividad
    addActivity({
      type: 'warning',
      icon: 'wifi-off',
      message: `Cámara desconectada (${session.ip})`
    });
  });

  // Eventos de reproducción (cuando OBS recibe el stream)
  nms.on("prePlay", (session) => {
    info(`[prePlay] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
    
    // Verificar si hay un publisher activo
    if (!session.broadcast?.publisher) {
      warn(" No hay stream publicado aún, el cliente intentará reconectar");
    }
  });

  nms.on("postPlay", (session) => {
    info(`[postPlay] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
    success(` OBS conectado desde ${session.ip}`);
    
    serverState.obsConnected = true;
    serverState.obsIP = session.ip;
    serverState.lastEvent = `OBS conectado desde ${session.ip}`;
    serverState.lastEventTime = new Date();
    serverState.status = serverState.cameraConnected ? 'streaming' : 'obs_waiting_camera';
    
    // Notificar a WebSocket
    updateServerState(serverState);
    
    // Agregar actividad
    addActivity({
      type: 'success',
      icon: 'monitor',
      message: `OBS conectado desde ${session.ip}`
    });
  });

  nms.on("donePlay", (session) => {
    info(`[donePlay] id=${session.id} StreamPath=${session.streamPath} ip=${session.ip}`);
    warn(` OBS desconectado (${session.ip})`);
    
    serverState.obsConnected = false;
    serverState.obsIP = null;
    serverState.lastEvent = `OBS desconectado (${session.ip})`;
    serverState.lastEventTime = new Date();
    serverState.status = serverState.cameraConnected ? 'camera_only' : 'waiting_camera';
    
    // Notificar a WebSocket
    updateServerState(serverState);
    
    // Agregar actividad
    addActivity({
      type: 'warning',
      icon: 'wifi-off',
      message: `OBS desconectado (${session.ip})`
    });
  });
}

// Función para actualizar métricas del sistema
function updateSystemMetrics() {
  const uptime = Math.floor((new Date() - serverState.startTime) / 1000);
  const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsageMB = Math.round(usedMem / 1024 / 1024);
  
  // Simular bitrate (en producción, esto vendría de estadísticas reales del stream)
  let bitrate = 0;
  if (serverState.status === 'streaming' || serverState.status === 'camera_only') {
    bitrate = (3.5 + Math.random() * 1.5).toFixed(2);
  }
  
  serverState.metrics = {
    uptime: uptime,
    bitrate: bitrate,
    droppedFrames: Math.floor(Math.random() * 5),
    cpu: cpuUsage.toFixed(1),
    memory: memUsageMB
  };
}

// Actualizar métricas cada 3 segundos
setInterval(() => {
  updateSystemMetrics();
}, 3000);

// Manejo de errores global
process.on('uncaughtException', (err) => {
  error(` Error no capturado: ${err.message}\n${err.stack}`);
  
  addActivity({
    type: 'error',
    icon: 'alert-triangle',
    message: `Error crítico: ${err.message}`
  });
  
  // No cerrar el proceso, solo registrar el error
});

process.on('unhandledRejection', (reason, promise) => {
  error(` Promesa rechazada no manejada: ${reason}`);
  
  addActivity({
    type: 'error',
    icon: 'alert-triangle',
    message: `Error en promesa: ${reason}`
  });
});

// Banner de inicio
console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║               SERVIDOR RTMP - PANEL DE CONTROL            ║
║                                                            ║
║  Dashboard:    http://${ip}:8001                     ║
║  WebSocket:    ws://${ip}:8002                       ║
║  RTMP:         rtmp://${ip}:1935/live/stream         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);

info(" Iniciando servidor RTMP...");
info(` URL de streaming: rtmp://${ip}:1935/live/stream`);
info(` Dashboard disponible en: http://${ip}:8001`);
info(` WebSocket Server: ws://${ip}:8002`);

// Configurar eventos y iniciar el servidor RTMP
setupNodeMediaEvents();
nms.run();

// Actualizar estado después de iniciar
setTimeout(() => {
  serverState.status = 'waiting_camera';
  serverState.lastEvent = 'Servidor iniciado correctamente';
  serverState.lastEventTime = new Date();
  success(' Servidor listo, esperando conexiones...');
  info(' Configura tu cámara IP para enviar a: rtmp://' + ip + ':1935/live/stream');
  info(' Configura OBS para recibir desde: rtmp://' + ip + ':1935/live/stream');
  
  // Notificar a WebSocket
  updateServerState(serverState);
  
  // Agregar actividad
  addActivity({
    type: 'success',
    icon: 'check-circle',
    message: 'Servidor RTMP iniciado correctamente'
  });
}, 1000);

// Manejo de cierre limpio
process.on('SIGINT', () => {
  console.log('\n Señal de cierre recibida (SIGINT)...');
  
  addActivity({
    type: 'error',
    icon: 'x-circle',
    message: 'Servidor detenido (SIGINT)'
  });
  
  setTimeout(() => {
    success(' Servidor RTMP cerrado correctamente');
    process.exit(0);
  }, 500);
});

process.on('SIGTERM', () => {
  console.log('\n Señal de cierre recibida (SIGTERM)...');
  
  addActivity({
    type: 'error',
    icon: 'x-circle',
    message: 'Servidor detenido (SIGTERM)'
  });
  
  setTimeout(() => {
    process.exit(0);
  }, 500);
});

// Exportar para uso programático si es necesario
export { serverState };