import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { renderStatusPage } from './status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, 'logs', 'app.log');
const HTTP_PORT = 8001;
const WS_PORT = 8002;

// Estado del dashboard
const dashboardState = {
  status: 'waiting_camera',
  lastEvent: 'Dashboard iniciado',
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

// WebSocket Server
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();
let lastLogPosition = 0;
let logWatcher = null;
let metricsInterval = null;

console.log(`🔌 WebSocket Server iniciado en puerto ${WS_PORT}`);

// Funciones de utilidad
function sendToClient(client, message) {
  if (client.readyState === 1) { // OPEN
    client.send(JSON.stringify(message));
  }
}

function broadcast(message) {
  clients.forEach(client => {
    sendToClient(client, message);
  });
}

function getRecentLogs(lines = 100) {
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = data.trim().split('\n');
    return allLines.slice(-lines);
  } catch (err) {
    return [];
  }
}

function checkNewLogs() {
  try {
    const stats = fs.statSync(LOG_FILE);
    const currentSize = stats.size;

    if (currentSize > lastLogPosition) {
      const stream = fs.createReadStream(LOG_FILE, {
        start: lastLogPosition,
        encoding: 'utf8'
      });

      let newContent = '';
      stream.on('data', (chunk) => {
        newContent += chunk;
      });

      stream.on('end', () => {
        const newLines = newContent.trim().split('\n').filter(line => line);
        if (newLines.length > 0) {
          broadcast({
            type: 'new_logs',
            data: newLines
          });
        }
        lastLogPosition = currentSize;
      });
    }
  } catch (err) {
    // Archivo no existe aún
  }
}

function updateMetrics() {
  // Calcular uptime
  dashboardState.metrics.uptime = Math.floor((new Date() - dashboardState.startTime) / 1000);
  
  // Bitrate solo si está transmitiendo
  if (dashboardState.status === 'streaming') {
    dashboardState.metrics.bitrate = parseFloat((3.5 + Math.random() * 1.5).toFixed(2));
  } else {
    dashboardState.metrics.bitrate = 0;
  }
  
  dashboardState.metrics.droppedFrames = Math.floor(Math.random() * 5);
  dashboardState.metrics.cpu = parseFloat((20 + Math.random() * 40).toFixed(1));
  dashboardState.metrics.memory = parseFloat((800 + Math.random() * 400).toFixed(0));

  broadcast({
    type: 'metrics_update',
    data: dashboardState.metrics
  });
}

// WebSocket Connections
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`✅ Cliente WebSocket conectado. Total: ${clients.size}`);

  // Enviar estado inicial
  sendToClient(ws, {
    type: 'initial_state',
    data: {
      state: dashboardState,
      logs: getRecentLogs(100)
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`❌ Cliente WebSocket desconectado. Total: ${clients.size}`);
  });

  ws.on('error', (error) => {
    console.error('Error en WebSocket:', error.message);
    clients.delete(ws);
  });

  // Si es el primer cliente, iniciar watchers
  if (clients.size === 1) {
    startWatchers();
  }
});

wss.on('close', () => {
  stopWatchers();
});

function startWatchers() {
  if (!logWatcher) {
    logWatcher = setInterval(() => {
      checkNewLogs();
    }, 1000);
    console.log('📝 Log watcher iniciado');
  }

  if (!metricsInterval) {
    metricsInterval = setInterval(() => {
      updateMetrics();
    }, 3000);
    console.log('📊 Metrics watcher iniciado');
  }
}

function stopWatchers() {
  if (logWatcher) {
    clearInterval(logWatcher);
    logWatcher = null;
    console.log('📝 Log watcher detenido');
  }

  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
    console.log('📊 Metrics watcher detenido');
  }
}

// HTTP Server para el dashboard
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderStatusPage(dashboardState));
  } else if (req.url === '/api/state' && req.method === 'POST') {
    // Endpoint para que el servidor RTMP actualice el estado
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        updateDashboardState(update);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/api/activity' && req.method === 'POST') {
    // Endpoint para agregar actividades
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const activity = JSON.parse(body);
        addActivity(activity);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('No encontrado');
  }
});

function updateDashboardState(update) {
  const oldState = { ...dashboardState };
  Object.assign(dashboardState, update);

  // Si cambió el startTime, actualizar
  if (update.startTime) {
    dashboardState.startTime = new Date(update.startTime);
  }
  if (update.lastEventTime) {
    dashboardState.lastEventTime = new Date(update.lastEventTime);
  }

  // Broadcast del cambio de estado
  broadcast({
    type: 'state_update',
    data: dashboardState
  });

  console.log(`📡 Estado actualizado: ${dashboardState.status}`);
}

function addActivity(activity) {
  const newActivity = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...activity
  };

  dashboardState.activities.unshift(newActivity);
  dashboardState.activities = dashboardState.activities.slice(0, 50);

  broadcast({
    type: 'new_activity',
    data: newActivity
  });

  console.log(`📌 Nueva actividad: ${activity.message}`);
}

// Iniciar servidor HTTP
httpServer.listen(HTTP_PORT, () => {
  console.log(`🚀 Dashboard HTTP corriendo en http://localhost:${HTTP_PORT}`);
  console.log(`📊 WebSocket corriendo en ws://localhost:${WS_PORT}`);
  console.log(`✅ Dashboard listo - funciona independientemente del servidor RTMP`);
});

// Manejo de cierre
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando Dashboard Server...');
  stopWatchers();
  wss.close();
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Cerrando Dashboard Server...');
  stopWatchers();
  wss.close();
  httpServer.close();
  process.exit(0);
});
