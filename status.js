import { getLocalIP } from './utils.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, 'logs', 'app.log');


// Leer últimos N logs
function readLastLines(file, lines = 50) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    const allLines = data.trim().split('\n');
    return allLines.slice(-lines).join('\n');
  } catch (err) {
    return 'No hay logs todavía...';
  }
}

// Calcular tiempo transcurrido
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `hace ${seconds} segundos`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
}

// Obtener datos del estado
function getStatusInfo(status) {
  const states = {
    starting: { emoji: '⚪', text: 'INICIANDO', color: '#999', desc: 'El servidor se está preparando...' },
    waiting_camera: { emoji: '🟡', text: 'ESPERANDO CÁMARA', color: '#ffa726', desc: 'Servidor activo, sin señal de cámara' },
    camera_only: { emoji: '🟠', text: 'CÁMARA SIN OBS', color: '#ff9800', desc: 'Cámara conectada, esperando OBS' },
    obs_waiting_camera: { emoji: '🔵', text: 'OBS SIN CÁMARA', color: '#42a5f5', desc: 'OBS conectado, esperando señal de cámara' },
    streaming: { emoji: '🟢', text: 'TRANSMITIENDO', color: '#4caf50', desc: '¡Todo funcionando correctamente!' },
    error: { emoji: '🔴', text: 'ERROR', color: '#f44336', desc: 'Se detectó un problema' }
  };
  return states[status] || states.waiting_camera;
}

// HTML mejorado con semáforo visual
function renderStatusPage(serverState = {}) {
  const ip = getLocalIP();
  const logs = readLastLines(LOG_FILE, 80);
  
  const status = getStatusInfo(serverState.status || 'waiting_camera');
  const uptime = serverState.startTime ? getTimeAgo(serverState.startTime) : '...';
  const lastEventTime = serverState.lastEventTime ? getTimeAgo(serverState.lastEventTime) : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Estado del Servidor RTMP</title>
  <meta http-equiv="refresh" content="3">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #eee;
      padding: 20px;
      margin: 0;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: #fff;
      text-align: center;
      font-size: 2em;
      margin-bottom: 30px;
    }
    .status-hero {
      background: linear-gradient(135deg, #2a2a2a 0%, #1e1e1e 100%);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 20px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .status-emoji {
      font-size: 4em;
      margin-bottom: 10px;
    }
    .status-text {
      font-size: 1.8em;
      font-weight: bold;
      margin-bottom: 10px;
      color: ${status.color};
    }
    .status-desc {
      font-size: 1.1em;
      color: #bbb;
      margin-bottom: 20px;
    }
    .last-event {
      background: rgba(255,255,255,0.05);
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid ${status.color};
      margin-top: 15px;
    }
    .last-event-text {
      font-size: 1em;
      color: #fff;
      margin: 0;
    }
    .last-event-time {
      font-size: 0.85em;
      color: #888;
      margin-top: 5px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .card {
      background: #1e1e1e;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .card h3 {
      margin-top: 0;
      color: #4caf50;
      font-size: 1.2em;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    .indicator {
      display: flex;
      align-items: center;
      margin: 12px 0;
      font-size: 1.1em;
    }
    .indicator-icon {
      font-size: 1.5em;
      margin-right: 10px;
      width: 30px;
    }
    .indicator-label {
      flex: 1;
      color: #ccc;
    }
    .indicator-value {
      font-weight: bold;
      color: #fff;
    }
    .connected { color: #4caf50; }
    .disconnected { color: #999; }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #333;
    }
    .info-label {
      color: #999;
    }
    .info-value {
      color: #fff;
      font-family: 'Courier New', monospace;
    }
    .logs {
      background: #000;
      color: #0f0;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      max-height: 400px;
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      box-shadow: inset 0 2px 10px rgba(0,0,0,0.8);
    }
    .footer {
      text-align: center;
      color: #666;
      margin-top: 20px;
      font-size: 0.9em;
    }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎥 Servidor RTMP - Estado en Vivo</h1>

    <div class="status-hero">
      <div class="status-emoji">${status.emoji}</div>
      <div class="status-text">${status.text}</div>
      <div class="status-desc">${status.desc}</div>
      
      ${serverState.lastEvent ? `
      <div class="last-event">
        <div class="last-event-text">📢 ${serverState.lastEvent}</div>
        <div class="last-event-time">${lastEventTime}</div>
      </div>
      ` : ''}
    </div>

    <div class="grid">
      <div class="card">
        <h3>🔌 Conexiones</h3>
        <div class="indicator">
          <span class="indicator-icon">${serverState.cameraConnected ? '🟢' : '⚫'}</span>
          <span class="indicator-label">Cámara</span>
          <span class="indicator-value ${serverState.cameraConnected ? 'connected' : 'disconnected'}">
            ${serverState.cameraConnected ? 'CONECTADA' : 'Desconectada'}
          </span>
        </div>
        ${serverState.cameraIP ? `<div style="margin-left: 40px; color: #888; font-size: 0.9em;">IP: ${serverState.cameraIP}</div>` : ''}
        
        <div class="indicator">
          <span class="indicator-icon">${serverState.obsConnected ? '🟢' : '⚫'}</span>
          <span class="indicator-label">OBS Studio</span>
          <span class="indicator-value ${serverState.obsConnected ? 'connected' : 'disconnected'}">
            ${serverState.obsConnected ? 'CONECTADO' : 'Desconectado'}
          </span>
        </div>
        ${serverState.obsIP ? `<div style="margin-left: 40px; color: #888; font-size: 0.9em;">IP: ${serverState.obsIP}</div>` : ''}
      </div>

      <div class="card">
        <h3>⚙️ Información del Servidor</h3>
        <div class="info-row">
          <span class="info-label">IP Local</span>
          <span class="info-value">${ip}</span>
        </div>
        <div class="info-row">
          <span class="info-label">URL RTMP</span>
          <span class="info-value">rtmp://${ip}:1935</span>
        </div>
        <div class="info-row">
          <span class="info-label">Puerto HTTP</span>
          <span class="info-value">http://${ip}:8000</span>
        </div>
        <div class="info-row">
          <span class="info-label">Tiempo Activo</span>
          <span class="info-value">${uptime}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>📋 Logs Recientes</h3>
      <pre class="logs">${logs}</pre>
    </div>

    <div class="footer">
      ⟳ Actualización automática cada 3 segundos
    </div>
  </div>

  <script>
    // Scroll automático al final de los logs cuando carga la página
    window.addEventListener('load', function() {
      const logsElement = document.querySelector('.logs');
      if (logsElement) {
        logsElement.scrollTop = logsElement.scrollHeight;
      }
    });
  </script>
</body>
</html>
`;
}

export {
  renderStatusPage
};
