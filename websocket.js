import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, 'logs', 'app.log');

class RTMPWebSocketServer {
  constructor(port = 8003) {
    this.wss = new WebSocketServer({ port });
    this.clients = new Set();
    this.lastLogPosition = 0;
    this.serverState = {
      status: 'waiting_camera',
      cameraConnected: false,
      obsConnected: false,
      cameraIP: null,
      obsIP: null,
      lastEvent: null,
      lastEventTime: null,
      startTime: new Date(),
      metrics: {
        uptime: 0,
        bitrate: 0,
        droppedFrames: 0,
        cpu: 0,
        memory: 0
      },
      activities: []
    };

    this.init();
  }

  init() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      // Enviar estado inicial
      this.sendToClient(ws, {
        type: 'initial_state',
        data: {
          state: this.serverState,
          logs: this.getRecentLogs(100)
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        this.clients.delete(ws);
      });
    });

    // Monitorear logs cada segundo
    this.logWatcher = setInterval(() => {
      this.checkNewLogs();
    }, 1000);

    // Actualizar métricas cada 3 segundos
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 3000);

  }

  sendToClient(client, message) {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(message));
    }
  }

  broadcast(message) {
    this.clients.forEach(client => {
      this.sendToClient(client, message);
    });
  }

  getRecentLogs(lines = 100) {
    try {
      const data = fs.readFileSync(LOG_FILE, 'utf8');
      const allLines = data.trim().split('\n');
      return allLines.slice(-lines);
    } catch (err) {
      return [];
    }
  }

  checkNewLogs() {
    try {
      const stats = fs.statSync(LOG_FILE);
      const currentSize = stats.size;

      if (currentSize > this.lastLogPosition) {
        const stream = fs.createReadStream(LOG_FILE, {
          start: this.lastLogPosition,
          encoding: 'utf8'
        });

        let newContent = '';
        stream.on('data', (chunk) => {
          newContent += chunk;
        });

        stream.on('end', () => {
          const newLines = newContent.trim().split('\n').filter(line => line);
          if (newLines.length > 0) {
            this.broadcast({
              type: 'new_logs',
              data: newLines
            });
          }
          this.lastLogPosition = currentSize;
        });
      }
    } catch (err) {
      // Archivo no existe aún
    }
  }

  updateMetrics() {
    // Simular métricas (en producción vendrían del servidor RTMP real)
    this.serverState.metrics = {
      uptime: Math.floor((new Date() - this.serverState.startTime) / 1000),
      bitrate: this.serverState.status === 'streaming' 
        ? (3.5 + Math.random() * 1.5).toFixed(2)
        : 0,
      droppedFrames: Math.floor(Math.random() * 5),
      cpu: (20 + Math.random() * 40).toFixed(1),
      memory: (800 + Math.random() * 400).toFixed(0)
    };

    this.broadcast({
      type: 'metrics_update',
      data: this.serverState.metrics
    });
  }

  updateServerState(newState) {
    const oldState = { ...this.serverState };
    this.serverState = { ...this.serverState, ...newState };

    // Detectar cambios y crear actividades
    if (oldState.cameraConnected !== this.serverState.cameraConnected) {
      const activity = {
        id: Date.now(),
        type: this.serverState.cameraConnected ? 'success' : 'error',
        icon: 'video',
        message: this.serverState.cameraConnected 
          ? `Cámara conectada desde ${this.serverState.cameraIP}`
          : 'Cámara desconectada',
        timestamp: new Date().toISOString()
      };
      this.serverState.activities.unshift(activity);
      this.serverState.activities = this.serverState.activities.slice(0, 50); // Mantener solo últimas 50

      this.broadcast({
        type: 'new_activity',
        data: activity
      });
    }

    if (oldState.obsConnected !== this.serverState.obsConnected) {
      const activity = {
        id: Date.now() + 1,
        type: this.serverState.obsConnected ? 'success' : 'error',
        icon: 'monitor',
        message: this.serverState.obsConnected 
          ? 'OBS Studio conectado'
          : 'OBS Studio desconectado',
        timestamp: new Date().toISOString()
      };
      this.serverState.activities.unshift(activity);
      this.serverState.activities = this.serverState.activities.slice(0, 50);

      this.broadcast({
        type: 'new_activity',
        data: activity
      });
    }

    // Broadcast cambio de estado
    this.broadcast({
      type: 'state_update',
      data: this.serverState
    });
  }

  addActivity(activity) {
    const newActivity = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...activity
    };
    
    this.serverState.activities.unshift(newActivity);
    this.serverState.activities = this.serverState.activities.slice(0, 50);

    this.broadcast({
      type: 'new_activity',
      data: newActivity
    });
  }

  close() {
    clearInterval(this.logWatcher);
    clearInterval(this.metricsInterval);
    this.wss.close();
  }
}

// Exportar singleton
let wsServer = null;

export function initWebSocketServer(port = 8001) {
  if (!wsServer) {
    wsServer = new RTMPWebSocketServer(port);
  }
  return wsServer;
}

export function getWebSocketServer() {
  return wsServer;
}

export function updateServerState(state) {
  if (wsServer) {
    wsServer.updateServerState(state);
  }
}

export function addActivity(activity) {
  if (wsServer) {
    wsServer.addActivity(activity);
  }
}