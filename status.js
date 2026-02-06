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
    .control-panel {
      background: #1e1e1e;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      text-align: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .control-panel h3 {
      margin-top: 0;
      color: #4caf50;
      font-size: 1.2em;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .btn-group {
      display: flex;
      gap: 15px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      padding: 12px 30px;
      font-size: 1em;
      font-weight: bold;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.3s ease;
      min-width: 150px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .btn:active {
      transform: translateY(0);
    }
    .btn-restart {
      background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
      color: white;
    }
    .btn-restart:hover {
      background: linear-gradient(135deg, #ffa726 0%, #fb8c00 100%);
    }
    .btn-stop {
      background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
      color: white;
    }
    .btn-stop:hover {
      background: linear-gradient(135deg, #e57373 0%, #f44336 100%);
    }
    .btn-start {
      background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
      color: white;
    }
    .btn-start:hover {
      background: linear-gradient(135deg, #66bb6a 0%, #4caf50 100%);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2a2a2a;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      display: none;
      z-index: 1000;
      border-left: 4px solid #4caf50;
    }
    .notification.show {
      display: block;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
      .btn-group { flex-direction: column; }
      .btn { width: 100%; }
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

    <div class="control-panel">
      <h3>🎮 Control del Servidor</h3>
      <div class="btn-group">
        <button class="btn btn-restart" onclick="controlServer('restart')">
          🔄 Reiniciar Servidor
        </button>
        <button class="btn btn-stop" onclick="controlServer('stop')">
          ⏹️ Detener Servidor
        </button>
      </div>
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

  <div id="notification" class="notification"></div>

  <script>
    // Scroll automático al final de los logs cuando carga la página
    window.addEventListener('load', function() {
      const logsElement = document.querySelector('.logs');
      if (logsElement) {
        logsElement.scrollTop = logsElement.scrollHeight;
      }
    });

    // Función para mostrar notificaciones
    function showNotification(message, duration = 3000) {
      const notification = document.getElementById('notification');
      notification.textContent = message;
      notification.classList.add('show');
      setTimeout(() => {
        notification.classList.remove('show');
      }, duration);
    }

    // Función para controlar el servidor
    async function controlServer(action) {
      const buttons = document.querySelectorAll('.btn');
      buttons.forEach(btn => btn.disabled = true);

      const messages = {
        restart: 'Reiniciando servidor...',
        stop: 'Deteniendo servidor...',
        start: 'Iniciando servidor...'
      };

      showNotification(messages[action]);

      try {
        const response = await fetch('/api/' + action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const result = await response.json();
        
        if (result.success) {
          showNotification('✅ ' + result.message);
          if (action !== 'stop') {
            setTimeout(function() { location.reload(); }, 2000);
          }
        } else {
          showNotification('❌ Error: ' + result.message, 5000);
        }
      } catch (error) {
        showNotification('❌ Error de conexión: ' + error.message, 5000);
      } finally {
        setTimeout(() => {
          buttons.forEach(btn => btn.disabled = false);
        }, 2000);
      }
    }
  </script>
</body>
</html>
`;
}

export {
  renderStatusPage
};
