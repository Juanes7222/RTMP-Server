import { getLocalIP } from './utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, 'logs', 'app.log');

// Leer últimos N logs
function readLastLines(file, lines = 100) {
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
  if (hours < 24) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days > 1 ? 's' : ''}`;
}

// Formatear tiempo en segundos a string legible
function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return `${days}d ${hrs}h`;
}

// Obtener datos del estado
function getStatusInfo(status) {
  const states = {
    starting: { 
      icon: 'loader', 
      text: 'INICIANDO', 
      color: '#9e9e9e', 
      bgColor: 'rgba(158, 158, 158, 0.1)',
      desc: 'El servidor se está preparando...' 
    },
    waiting_camera: { 
      icon: 'alert-circle', 
      text: 'ESPERANDO CÁMARA', 
      color: '#ffa726', 
      bgColor: 'rgba(255, 167, 38, 0.1)',
      desc: 'Servidor activo, sin señal de cámara' 
    },
    camera_only: { 
      icon: 'camera', 
      text: 'CÁMARA SIN OBS', 
      color: '#ff9800', 
      bgColor: 'rgba(255, 152, 0, 0.1)',
      desc: 'Cámara conectada, esperando OBS' 
    },
    obs_waiting_camera: { 
      icon: 'monitor', 
      text: 'OBS SIN CÁMARA', 
      color: '#42a5f5', 
      bgColor: 'rgba(66, 165, 245, 0.1)',
      desc: 'OBS conectado, esperando señal de cámara' 
    },
    streaming: { 
      icon: 'radio', 
      text: 'TRANSMITIENDO', 
      color: '#4caf50', 
      bgColor: 'rgba(76, 175, 80, 0.1)',
      desc: '¡Todo funcionando correctamente!' 
    },
    error: { 
      icon: 'alert-triangle', 
      text: 'ERROR', 
      color: '#f44336', 
      bgColor: 'rgba(244, 67, 54, 0.1)',
      desc: 'Se detectó un problema' 
    }
  };
  return states[status] || states.waiting_camera;
}

// HTML con WebSocket y todas las mejoras
function renderStatusPage(serverState = {}) {
  const ip = getLocalIP();
  const logs = readLastLines(LOG_FILE, 100);
  
  const status = getStatusInfo(serverState.status || 'waiting_camera');
  const uptime = serverState.startTime ? getTimeAgo(serverState.startTime) : '...';
  const lastEventTime = serverState.lastEventTime ? getTimeAgo(serverState.lastEventTime) : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>RTMP Server - Panel de Control</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  
  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    :root {
      --bg-primary: linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 50%, #16213e 100%);
      --bg-card: linear-gradient(135deg, rgba(30, 30, 46, 0.9) 0%, rgba(24, 24, 37, 0.9) 100%);
      --color-text-primary: #e4e4e7;
      --color-text-secondary: #94a3b8;
      --color-text-tertiary: #64748b;
      --color-border: rgba(255, 255, 255, 0.1);
      --color-success: #4caf50;
      --color-error: #ef4444;
      --color-warning: #f59e0b;
      --color-info: #3b82f6;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: var(--bg-primary);
      color: var(--color-text-primary);
      overflow-x: hidden;
      min-height: 100vh;
    }
    
    body.light-mode {
      --bg-primary: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 50%, #cbd5e1 100%);
      --bg-card: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%);
      --color-text-primary: #0f172a;
      --color-text-secondary: #475569;
      --color-text-tertiary: #64748b;
      --color-border: rgba(0, 0, 0, 0.1);
    }
    
    /* Top Stats Bar */
    .top-bar {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--color-border);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 20px;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      flex-wrap: wrap;
    }
    
    .top-bar-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9em;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      transition: all 0.3s ease;
    }
    
    .top-bar-item:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-success);
      animation: pulse-dot 2s ease-in-out infinite;
    }
    
    @keyframes pulse-dot {
      0%, 100% { box-shadow: 0 0 0 0 var(--color-success)80; }
      50% { box-shadow: 0 0 0 6px var(--color-success)00; }
    }
    
    .top-bar-value {
      font-weight: 600;
      color: var(--color-success);
    }
    
    .spacer {
      flex: 1;
    }
    
    .ws-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85em;
      padding: 4px 10px;
      background: rgba(76, 175, 80, 0.2);
      border: 1px solid rgba(76, 175, 80, 0.4);
      border-radius: 6px;
      transition: all 0.3s ease;
    }
    
    .ws-indicator.disconnected {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.4);
    }
    
    .ws-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-success);
      animation: pulse-dot 1.5s ease-in-out infinite;
    }
    
    .ws-indicator.disconnected .ws-dot {
      background: var(--color-error);
      animation: none;
    }
    
    .theme-toggle {
      width: 50px;
      height: 26px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 13px;
      position: relative;
      cursor: pointer;
      transition: background 0.3s ease;
      border: 1px solid var(--color-border);
    }
    
    .theme-toggle:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    
    .theme-toggle-slider {
      width: 20px;
      height: 20px;
      background: #fff;
      border-radius: 50%;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: transform 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    body.light-mode .theme-toggle-slider {
      transform: translateX(24px);
    }
    
    /* Container */
    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* Status Hero */
    .status-hero {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      padding: 40px;
      border-radius: 16px;
      margin-bottom: 25px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid var(--color-border);
      position: relative;
      overflow: hidden;
      animation: fadeIn 0.6s ease;
    }
    
    .status-icon-wrapper {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100px;
      height: 100px;
      background: ${status.bgColor};
      border-radius: 50%;
      margin-bottom: 20px;
      border: 3px solid ${status.color};
      animation: pulse 2s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 ${status.color}80; }
      50% { box-shadow: 0 0 0 10px ${status.color}00; }
    }
    
    .status-text {
      font-size: 2em;
      font-weight: 700;
      margin-bottom: 12px;
      color: ${status.color};
      letter-spacing: 1px;
    }
    
    .status-desc {
      font-size: 1.1em;
      color: var(--color-text-secondary);
    }
    
    /* Charts */
    .chart-card {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      padding: 25px;
      border-radius: 16px;
      margin-bottom: 25px;
      border: 1px solid var(--color-border);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      animation: fadeIn 0.6s ease 0.1s both;
    }
    
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 15px;
    }
    
    .chart-title {
      font-size: 1.3em;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .chart-filters {
      display: flex;
      gap: 10px;
    }
    
    .filter-btn {
      padding: 6px 14px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all 0.3s ease;
      font-size: 0.9em;
    }
    
    .filter-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text-primary);
    }
    
    .filter-btn.active {
      background: rgba(76, 175, 80, 0.2);
      border-color: rgba(76, 175, 80, 0.4);
      color: var(--color-success);
    }
    
    /* Grid Layout */
    .grid-2 {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 25px;
      margin-bottom: 25px;
    }
    
    /* Activity Feed */
    .activity-feed {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      padding: 25px;
      border-radius: 16px;
      border: 1px solid var(--color-border);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      max-height: 500px;
      overflow-y: auto;
      animation: fadeIn 0.6s ease 0.2s both;
    }
    
    .activity-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid var(--color-border);
    }
    
    .activity-title {
      font-size: 1.3em;
      font-weight: 600;
      flex: 1;
    }
    
    .live-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.4);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.85em;
      font-weight: 600;
      color: var(--color-error);
    }
    
    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-error);
      animation: blink 1s ease-in-out infinite;
    }
    
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    
    .activity-item {
      display: flex;
      gap: 15px;
      padding: 15px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 10px;
      margin-bottom: 10px;
      border-left: 3px solid transparent;
      transition: all 0.3s ease;
      animation: slideInActivity 0.5s ease;
    }
    
    @keyframes slideInActivity {
      from {
        opacity: 0;
        transform: translateX(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    .activity-item:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    
    .activity-item.success {
      border-left-color: var(--color-success);
    }
    
    .activity-item.warning {
      border-left-color: var(--color-warning);
    }
    
    .activity-item.error {
      border-left-color: var(--color-error);
    }
    
    .activity-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    
    .activity-icon.success {
      background: rgba(76, 175, 80, 0.2);
    }
    
    .activity-icon.warning {
      background: rgba(245, 158, 11, 0.2);
    }
    
    .activity-icon.error {
      background: rgba(239, 68, 68, 0.2);
    }
    
    .activity-content {
      flex: 1;
    }
    
    .activity-text {
      font-size: 0.95em;
      color: var(--color-text-primary);
      margin-bottom: 4px;
    }
    
    .activity-time {
      font-size: 0.85em;
      color: var(--color-text-tertiary);
    }
    
    /* Health Score */
    .health-score {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      padding: 25px;
      border-radius: 16px;
      border: 1px solid var(--color-border);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      text-align: center;
      animation: fadeIn 0.6s ease 0.3s both;
    }
    
    .health-value {
      font-size: 3em;
      font-weight: 700;
      background: linear-gradient(135deg, var(--color-success) 0%, #66bb6a 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 10px;
    }
    
    .health-label {
      font-size: 1em;
      color: var(--color-text-secondary);
      margin-bottom: 20px;
    }
    
    .health-bar {
      width: 100%;
      height: 12px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    
    .health-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--color-success) 0%, #66bb6a 100%);
      border-radius: 6px;
      transition: width 1s ease;
    }
    
    .health-status {
      font-size: 1.2em;
      font-weight: 600;
      color: var(--color-success);
      margin-bottom: 15px;
    }
    
    .health-checks {
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .health-check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9em;
      color: var(--color-text-secondary);
    }
    
    /* Logs */
    .logs-card {
      animation: fadeIn 0.6s ease 0.4s both;
    }
    
    .logs-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .logs-title {
      font-size: 1.3em;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .logs-controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    
    .log-filter-btn {
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all 0.3s ease;
      font-size: 0.85em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .log-filter-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    
    .log-filter-btn.active {
      background: rgba(76, 175, 80, 0.2);
      border-color: rgba(76, 175, 80, 0.4);
      color: var(--color-success);
    }
    
    .logs-search {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .logs-search-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 8px 12px;
      color: var(--color-text-primary);
      font-size: 0.9em;
      outline: none;
      transition: all 0.3s ease;
    }
    
    .logs-search-input:focus {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(76, 175, 80, 0.4);
    }
    
    .logs {
      background: #0a0a0f;
      color: #10b981;
      padding: 20px;
      border-radius: 10px;
      overflow-x: auto;
      max-height: 500px;
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      line-height: 1.6;
      box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.8);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }
    
    body.light-mode .logs {
      background: #f8fafc;
      color: #0f172a;
      border-color: rgba(15, 23, 42, 0.2);
    }
    
    .log-line {
      margin-bottom: 4px;
      transition: background 0.2s ease;
    }
    
    .log-line:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    
    .log-line.error {
      color: #ef4444;
    }
    
    .log-line.warning {
      color: #f59e0b;
    }
    
    .log-line.info {
      color: #3b82f6;
    }
    
    .log-line.highlight {
      background: rgba(245, 158, 11, 0.2);
    }
    
    .logs::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    .logs::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
    }
    
    .logs::-webkit-scrollbar-thumb {
      background: rgba(16, 185, 129, 0.3);
      border-radius: 4px;
    }
    
    .logs::-webkit-scrollbar-thumb:hover {
      background: rgba(16, 185, 129, 0.5);
    }
    
    /* Command Palette */
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
      z-index: 999;
    }
    
    .overlay.active {
      opacity: 1;
      pointer-events: all;
    }
    
    .command-palette {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.95);
      background: var(--bg-card);
      backdrop-filter: blur(20px);
      border-radius: 16px;
      border: 1px solid var(--color-border);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      width: 90%;
      max-width: 600px;
      max-height: 500px;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1000;
    }
    
    .command-palette.active {
      opacity: 1;
      pointer-events: all;
      transform: translate(-50%, -50%) scale(1);
    }
    
    .command-search {
      padding: 20px;
      border-bottom: 1px solid var(--color-border);
    }
    
    .command-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 12px 16px;
      color: var(--color-text-primary);
      font-size: 1em;
      outline: none;
      transition: all 0.3s ease;
    }
    
    .command-input:focus {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(76, 175, 80, 0.4);
    }
    
    .command-list {
      max-height: 400px;
      overflow-y: auto;
      padding: 10px;
    }
    
    .command-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .command-item:hover,
    .command-item.selected {
      background: rgba(76, 175, 80, 0.2);
    }
    
    .command-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
    }
    
    .command-text {
      flex: 1;
    }
    
    .command-name {
      font-size: 0.95em;
      color: var(--color-text-primary);
      margin-bottom: 2px;
    }
    
    .command-desc {
      font-size: 0.8em;
      color: var(--color-text-tertiary);
    }
    
    .command-shortcut {
      font-size: 0.85em;
      color: var(--color-text-secondary);
      background: rgba(255, 255, 255, 0.05);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: monospace;
    }
    
    /* Control Panel */
    .control-panel {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      padding: 25px;
      border-radius: 16px;
      margin-bottom: 25px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid var(--color-border);
    }
    
    .control-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .control-title {
      font-size: 1.3em;
      font-weight: 600;
    }
    
    .btn-group {
      display: flex;
      gap: 15px;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .btn {
      padding: 14px 32px;
      font-size: 1em;
      font-weight: 600;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s ease;
      min-width: 180px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    }
    
    .btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    }
    
    .btn:active:not(:disabled) {
      transform: translateY(0);
    }
    
    .btn-restart {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
    }
    
    .btn-restart:hover:not(:disabled) {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    }
    
    .btn-stop {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }
    
    .btn-stop:hover:not(:disabled) {
      background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
    }
    
    .btn-start {
      background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
      color: white;
    }
    
    .btn-start:hover:not(:disabled) {
      background: linear-gradient(135deg, #66bb6a 0%, #4caf50 100%);
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    /* Notification */
    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      color: var(--color-text-primary);
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      display: none;
      z-index: 1000;
      border: 1px solid var(--color-border);
      min-width: 300px;
      align-items: center;
      gap: 12px;
    }
    
    .notification.show {
      display: flex;
      animation: slideIn 0.3s ease;
    }
    
    /* Keyboard Hint */
    .keyboard-hint {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid var(--color-border);
      font-size: 0.9em;
      color: var(--color-text-secondary);
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    
    .key {
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: monospace;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    
    /* Animations */
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
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
    
    /* Responsive */
    @media (max-width: 1024px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }
    }
    
    @media (max-width: 768px) {
      .top-bar {
        gap: 10px;
      }
      
      .status-hero {
        padding: 30px 20px;
      }
      
      .status-icon-wrapper {
        width: 80px;
        height: 80px;
      }
      
      .status-text {
        font-size: 1.5em;
      }
      
      .btn-group {
        flex-direction: column;
      }
      
      .btn {
        width: 100%;
      }
      
      .notification,
      .keyboard-hint {
        left: 20px;
        right: 20px;
        min-width: auto;
      }
    }
  </style>
</head>
<body>
  <!-- Top Stats Bar -->
  <div class="top-bar">
    <div class="top-bar-item">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">CARGANDO...</span>
    </div>
    
    <div class="top-bar-item">
      <i data-lucide="clock" style="width: 16px; height: 16px; color: var(--color-text-tertiary);"></i>
      <span class="top-bar-value" id="uptimeDisplay">...</span>
    </div>
    
    <div class="top-bar-item">
      <i data-lucide="activity" style="width: 16px; height: 16px; color: var(--color-text-tertiary);"></i>
      <span class="top-bar-value" id="bitrateDisplay">0 Mbps</span>
    </div>
    
    <div class="top-bar-item">
      <i data-lucide="cpu" style="width: 16px; height: 16px; color: var(--color-text-tertiary);"></i>
      <span class="top-bar-value" id="cpuDisplay">0%</span>
    </div>
    
    <div class="spacer"></div>
    
    <div class="ws-indicator" id="wsIndicator">
      <div class="ws-dot"></div>
      <span>Conectando...</span>
    </div>
    
    <div class="theme-toggle" onclick="toggleTheme()">
      <div class="theme-toggle-slider">
        <i data-lucide="moon" style="width: 14px; height: 14px;"></i>
      </div>
    </div>
  </div>

  <!-- Command Palette Overlay -->
  <div class="overlay" id="overlay" onclick="closeCommandPalette()"></div>
  
  <!-- Command Palette -->
  <div class="command-palette" id="commandPalette">
    <div class="command-search">
      <input 
        type="text" 
        class="command-input" 
        placeholder="Buscar comando... (Esc para cerrar)"
        id="commandInput"
        onkeyup="filterCommands(event)"
      >
    </div>
    <div class="command-list" id="commandList">
      <!-- Commands will be populated by JS -->
    </div>
  </div>

  <div class="container">
    <!-- Status Hero -->
    <div class="status-hero" id="statusHero">
      <div class="status-icon-wrapper" id="statusIconWrapper">
        <i data-lucide="${status.icon}" id="statusIcon" style="width: 50px; height: 50px; color: ${status.color};"></i>
      </div>
      <div class="status-text" id="statusMainText">${status.text}</div>
      <div class="status-desc" id="statusDesc">${status.desc}</div>
    </div>

    <!-- Control Panel -->
    <div class="control-panel">
      <div class="control-header">
        <i data-lucide="settings" style="width: 24px; height: 24px;"></i>
        <div class="control-title">Control del Servidor</div>
      </div>
      <div class="btn-group">
        <button class="btn btn-start" onclick="controlServer('start')">
          <i data-lucide="play" style="width: 20px; height: 20px;"></i>
          Iniciar Servidor
        </button>
        <button class="btn btn-restart" onclick="controlServer('restart')">
          <i data-lucide="rotate-cw" style="width: 20px; height: 20px;"></i>
          Reiniciar Servidor
        </button>
        <button class="btn btn-stop" onclick="controlServer('stop')">
          <i data-lucide="square" style="width: 20px; height: 20px;"></i>
          Detener Servidor
        </button>
      </div>
    </div>

    <!-- Chart -->
    <div class="chart-card">
      <div class="chart-header">
        <div class="chart-title">
          <i data-lucide="trending-up" style="width: 24px; height: 24px;"></i>
          Métricas en Tiempo Real
        </div>
        <div class="chart-filters">
          <button class="filter-btn active" onclick="changeTimeRange('1h')">1h</button>
          <button class="filter-btn" onclick="changeTimeRange('6h')">6h</button>
          <button class="filter-btn" onclick="changeTimeRange('24h')">24h</button>
        </div>
      </div>
      <canvas id="metricsChart" height="80"></canvas>
    </div>

    <!-- Grid: Activity Feed + Health Score -->
    <div class="grid-2">
      <!-- Activity Feed -->
      <div class="activity-feed">
        <div class="activity-header">
          <i data-lucide="zap" style="width: 24px; height: 24px; color: var(--color-warning);"></i>
          <div class="activity-title">Actividad en Vivo</div>
          <div class="live-badge">
            <div class="live-dot"></div>
            LIVE
          </div>
        </div>
        <div id="activityContainer">
          <!-- Activities will be added by JS -->
        </div>
      </div>

      <!-- Health Score -->
      <div class="health-score">
        <div class="health-value" id="healthValue">--</div>
        <div class="health-label">Health Score</div>
        <div class="health-bar">
          <div class="health-bar-fill" id="healthBarFill" style="width: 0%;"></div>
        </div>
        <div class="health-status" id="healthStatus">Calculando...</div>
        <div class="health-checks" id="healthChecks">
          <!-- Health checks will be added by JS -->
        </div>
      </div>
    </div>

    <!-- Logs -->
    <div class="chart-card logs-card">
      <div class="logs-header">
        <div class="logs-title">
          <i data-lucide="file-text" style="width: 24px; height: 24px;"></i>
          Logs del Sistema
        </div>
        <div class="logs-controls">
          <button class="log-filter-btn active" onclick="filterLogs('all')">
            <i data-lucide="list" style="width: 14px; height: 14px;"></i>
            Todos
          </button>
          <button class="log-filter-btn" onclick="filterLogs('error')">
            <i data-lucide="alert-circle" style="width: 14px; height: 14px;"></i>
            Errors
          </button>
          <button class="log-filter-btn" onclick="filterLogs('warning')">
            <i data-lucide="alert-triangle" style="width: 14px; height: 14px;"></i>
            Warnings
          </button>
          <button class="log-filter-btn" onclick="clearLogs()">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            Limpiar
          </button>
        </div>
      </div>
      <div class="logs-search">
        <input 
          type="text" 
          class="logs-search-input" 
          placeholder="Buscar en logs..." 
          id="logsSearchInput"
          onkeyup="searchLogs()"
        >
      </div>
      <pre class="logs" id="logsContainer">${logs}</pre>
    </div>
  </div>

  <!-- Notification -->
  <div id="notification" class="notification"></div>

  <!-- Keyboard Hint -->
  <div class="keyboard-hint">
    <span>Presiona</span>
    <span class="key">Ctrl+K</span>
    <span>para comandos</span>
  </div>

  <script>
    // WebSocket Connection
    const WS_URL = 'ws://${ip}:8002';
    let ws = null;
    let reconnectTimeout = null;
    let chart = null;
    let chartData = {
      labels: [],
      bitrate: [],
      cpu: []
    };
    let currentLogFilter = 'all';
    let currentSearchTerm = '';

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
      initWebSocket();
      initChart();
      initCommands();
      initKeyboardShortcuts();
      loadThemePreference();
      lucide.createIcons();
    });

    // WebSocket Functions
    function initWebSocket() {
      ws = new WebSocket(WS_URL);
      
      ws.onopen = function() {
        console.log('✅ WebSocket conectado');
        updateWSIndicator(true);
      };
      
      ws.onmessage = function(event) {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      };
      
      ws.onerror = function(error) {
        console.error('❌ WebSocket error:', error);
        updateWSIndicator(false);
      };
      
      ws.onclose = function() {
        console.log('🔌 WebSocket desconectado');
        updateWSIndicator(false);
        
        // Reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          console.log('🔄 Reconectando WebSocket...');
          initWebSocket();
        }, 3000);
      };
    }

    function handleWebSocketMessage(message) {
      switch(message.type) {
        case 'initial_state':
          updateServerState(message.data.state);
          updateLogs(message.data.logs.join('\\n'));
          break;
          
        case 'state_update':
          updateServerState(message.data);
          break;
          
        case 'new_logs':
          appendLogs(message.data);
          break;
          
        case 'metrics_update':
          updateMetrics(message.data);
          break;
          
        case 'new_activity':
          addActivity(message.data);
          break;
      }
    }

    function updateWSIndicator(connected) {
      const indicator = document.getElementById('wsIndicator');
      if (connected) {
        indicator.classList.remove('disconnected');
        indicator.innerHTML = '<div class="ws-dot"></div><span>Conectado</span>';
      } else {
        indicator.classList.add('disconnected');
        indicator.innerHTML = '<div class="ws-dot"></div><span>Desconectado</span>';
      }
    }

    // Update Functions
    function updateServerState(state) {
      // Update status
      const statusInfo = getStatusInfo(state.status);
      document.getElementById('statusMainText').textContent = statusInfo.text;
      document.getElementById('statusDesc').textContent = statusInfo.desc;
      document.getElementById('statusText').textContent = statusInfo.text;
      
      // Update icon
      const iconWrapper = document.getElementById('statusIconWrapper');
      iconWrapper.style.border = \`3px solid \${statusInfo.color}\`;
      iconWrapper.style.background = statusInfo.bgColor;
      
      const icon = document.getElementById('statusIcon');
      icon.setAttribute('data-lucide', statusInfo.icon);
      icon.style.color = statusInfo.color;
      
      // Update uptime
      if (state.metrics && state.metrics.uptime) {
        document.getElementById('uptimeDisplay').textContent = formatUptime(state.metrics.uptime);
      }
      
      // Calculate and update health score
      updateHealthScore(state);
      
      lucide.createIcons();
    }

    function updateMetrics(metrics) {
      // Update top bar
      document.getElementById('bitrateDisplay').textContent = metrics.bitrate + ' Mbps';
      document.getElementById('cpuDisplay').textContent = metrics.cpu + '%';
      
      // Update chart
      const now = new Date();
      const timeLabel = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
      
      chartData.labels.push(timeLabel);
      chartData.bitrate.push(parseFloat(metrics.bitrate));
      chartData.cpu.push(parseFloat(metrics.cpu));
      
      // Keep only last 60 data points
      if (chartData.labels.length > 60) {
        chartData.labels.shift();
        chartData.bitrate.shift();
        chartData.cpu.shift();
      }
      
      updateChart();
    }

    function updateLogs(logsText) {
      const container = document.getElementById('logsContainer');
      container.textContent = logsText;
      scrollLogsToBottom();
      applyLogFilters();
    }

    function appendLogs(newLines) {
      const container = document.getElementById('logsContainer');
      const currentText = container.textContent;
      const newText = currentText + '\\n' + newLines.join('\\n');
      
      // Keep only last 1000 lines
      const lines = newText.split('\\n');
      if (lines.length > 1000) {
        container.textContent = lines.slice(-1000).join('\\n');
      } else {
        container.textContent = newText;
      }
      
      scrollLogsToBottom();
      applyLogFilters();
    }

    function addActivity(activity) {
      const container = document.getElementById('activityContainer');
      const activityEl = createActivityElement(activity);
      container.insertBefore(activityEl, container.firstChild);
      
      // Keep only last 20 activities visible
      while (container.children.length > 20) {
        container.removeChild(container.lastChild);
      }
    }

    function createActivityElement(activity) {
      const div = document.createElement('div');
      div.className = \`activity-item \${activity.type}\`;
      
      const timeAgo = getTimeAgo(new Date(activity.timestamp));
      
      div.innerHTML = \`
        <div class="activity-icon \${activity.type}">
          <i data-lucide="\${activity.icon}" style="width: 20px; height: 20px; color: var(--color-\${activity.type});"></i>
        </div>
        <div class="activity-content">
          <div class="activity-text">\${activity.message}</div>
          <div class="activity-time">\${timeAgo}</div>
        </div>
      \`;
      
      lucide.createIcons();
      return div;
    }

    function updateHealthScore(state) {
      let score = 0;
      const checks = [];
      
      // Camera connected (30 points)
      if (state.cameraConnected) {
        score += 30;
        checks.push({ text: 'Cámara conectada', ok: true });
      } else {
        checks.push({ text: 'Cámara desconectada', ok: false });
      }
      
      // OBS connected (30 points)
      if (state.obsConnected) {
        score += 30;
        checks.push({ text: 'OBS conectado', ok: true });
      } else {
        checks.push({ text: 'OBS desconectado', ok: false });
      }
      
      // Bitrate (20 points)
      const bitrate = state.metrics ? parseFloat(state.metrics.bitrate) : 0;
      if (bitrate > 3) {
        score += 20;
        checks.push({ text: 'Bitrate estable', ok: true });
      } else if (bitrate > 0) {
        score += 10;
        checks.push({ text: 'Bitrate bajo', ok: false });
      } else {
        checks.push({ text: 'Sin bitrate', ok: false });
      }
      
      // CPU (20 points)
      const cpu = state.metrics ? parseFloat(state.metrics.cpu) : 0;
      if (cpu < 70) {
        score += 20;
        checks.push({ text: \`CPU normal (\${cpu}%)\`, ok: true });
      } else {
        score += 10;
        checks.push({ text: \`CPU alto (\${cpu}%)\`, ok: false });
      }
      
      // Update UI
      document.getElementById('healthValue').textContent = score;
      document.getElementById('healthBarFill').style.width = score + '%';
      
      let status = 'Regular';
      if (score >= 90) status = '⚡ Excelente';
      else if (score >= 70) status = '✓ Bueno';
      else if (score >= 50) status = '~ Regular';
      else status = '⚠ Crítico';
      
      document.getElementById('healthStatus').textContent = status;
      
      // Update checks
      const checksContainer = document.getElementById('healthChecks');
      checksContainer.innerHTML = checks.map(check => \`
        <div class="health-check">
          <i data-lucide="\${check.ok ? 'check-circle' : 'x-circle'}" 
             style="width: 16px; height: 16px; color: var(--color-\${check.ok ? 'success' : 'error'});">
          </i>
          <span>\${check.text}</span>
        </div>
      \`).join('');
      
      lucide.createIcons();
    }

    // Chart Functions
    function initChart() {
      const ctx = document.getElementById('metricsChart').getContext('2d');
      
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: chartData.labels,
          datasets: [
            {
              label: 'Bitrate (Mbps)',
              data: chartData.bitrate,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              yAxisID: 'y'
            },
            {
              label: 'CPU (%)',
              data: chartData.cpu,
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            legend: {
              labels: {
                color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary'),
                font: { size: 12 }
              }
            },
            tooltip: {
              backgroundColor: 'rgba(30, 30, 46, 0.95)',
              titleColor: '#fff',
              bodyColor: '#cbd5e1',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1
            }
          },
          scales: {
            x: {
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              },
              ticks: {
                color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary')
              }
            },
            y: {
              type: 'linear',
              position: 'left',
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              },
              ticks: {
                color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary'),
                callback: function(value) {
                  return value.toFixed(1) + ' Mbps';
                }
              },
              min: 0,
              max: 6
            },
            y1: {
              type: 'linear',
              position: 'right',
              grid: {
                drawOnChartArea: false
              },
              ticks: {
                color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary'),
                callback: function(value) {
                  return value + '%';
                }
              },
              min: 0,
              max: 100
            }
          }
        }
      });
    }

    function updateChart() {
      if (chart) {
        chart.data.labels = chartData.labels;
        chart.data.datasets[0].data = chartData.bitrate;
        chart.data.datasets[1].data = chartData.cpu;
        chart.update('none'); // Update without animation for smooth real-time updates
      }
    }

    // Log Functions
    function scrollLogsToBottom() {
      const container = document.getElementById('logsContainer');
      container.scrollTop = container.scrollHeight;
    }

    function filterLogs(type) {
      currentLogFilter = type;
      
      // Update button states
      document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      event.target.closest('.log-filter-btn').classList.add('active');
      
      applyLogFilters();
    }

    function searchLogs() {
      currentSearchTerm = document.getElementById('logsSearchInput').value.toLowerCase();
      applyLogFilters();
    }

    function applyLogFilters() {
      const container = document.getElementById('logsContainer');
      const lines = container.textContent.split('\\n');
      
      let filteredLines = lines;
      
      // Apply type filter
      if (currentLogFilter !== 'all') {
        filteredLines = filteredLines.filter(line => {
          const lower = line.toLowerCase();
          if (currentLogFilter === 'error') return lower.includes('error') || lower.includes('err');
          if (currentLogFilter === 'warning') return lower.includes('warn') || lower.includes('warning');
          return true;
        });
      }
      
      // Apply search filter
      if (currentSearchTerm) {
        filteredLines = filteredLines.filter(line => 
          line.toLowerCase().includes(currentSearchTerm)
        );
      }
      
      // Highlight search term
      const html = filteredLines.map(line => {
        let className = 'log-line';
        const lower = line.toLowerCase();
        
        if (lower.includes('error') || lower.includes('err')) className += ' error';
        else if (lower.includes('warn')) className += ' warning';
        else if (lower.includes('info')) className += ' info';
        
        if (currentSearchTerm && line.toLowerCase().includes(currentSearchTerm)) {
          className += ' highlight';
        }
        
        return \`<div class="\${className}">\${escapeHtml(line)}</div>\`;
      }).join('');
      
      container.innerHTML = html;
      scrollLogsToBottom();
    }

    function clearLogs() {
      if (confirm('¿Estás seguro de que quieres limpiar los logs?')) {
        document.getElementById('logsContainer').textContent = '';
        showNotification('Logs limpiados', 'success');
      }
    }

    // Command Palette
    function initCommands() {
      const commands = [
        {
          icon: 'play',
          name: 'Iniciar servidor',
          desc: 'Inicia el servidor RTMP',
          shortcut: 'Ctrl+I',
          action: () => controlServer('start')
        },
        {
          icon: 'rotate-cw',
          name: 'Reiniciar servidor',
          desc: 'Reinicia el servidor RTMP',
          shortcut: 'Ctrl+Shift+R',
          action: () => controlServer('restart')
        },
        {
          icon: 'square',
          name: 'Detener servidor',
          desc: 'Detiene la transmisión',
          shortcut: 'Ctrl+S',
          action: () => controlServer('stop')
        },
        {
          icon: 'trash-2',
          name: 'Limpiar logs',
          desc: 'Elimina todos los logs',
          shortcut: 'Ctrl+L',
          action: () => clearLogs()
        },
        {
          icon: 'palette',
          name: 'Cambiar tema',
          desc: 'Alterna entre modo claro y oscuro',
          shortcut: 'Ctrl+Shift+T',
          action: () => toggleTheme()
        },
        {
          icon: 'download',
          name: 'Exportar logs',
          desc: 'Descarga los logs como archivo',
          shortcut: 'Ctrl+E',
          action: () => exportLogs()
        }
      ];
      
      const list = document.getElementById('commandList');
      list.innerHTML = commands.map((cmd, i) => \`
        <div class="command-item \${i === 0 ? 'selected' : ''}" onclick="executeCommand(\${i})">
          <div class="command-icon">
            <i data-lucide="\${cmd.icon}" style="width: 18px; height: 18px;"></i>
          </div>
          <div class="command-text">
            <div class="command-name">\${cmd.name}</div>
            <div class="command-desc">\${cmd.desc}</div>
          </div>
          <div class="command-shortcut">\${cmd.shortcut}</div>
        </div>
      \`).join('');
      
      lucide.createIcons();
      
      // Store commands globally
      window.commands = commands;
    }

    function initKeyboardShortcuts() {
      document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K - Command Palette
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          openCommandPalette();
        }
        
        // Escape - Close Command Palette
        if (e.key === 'Escape') {
          closeCommandPalette();
        }
        
        // Ctrl + R - Restart
        if (e.ctrlKey && e.shiftKey && e.key === 'r') {
          e.preventDefault();
          controlServer('restart');
        }
        
        // Ctrl + I - Start
        if (e.ctrlKey && e.key === 'i') {
          e.preventDefault();
          controlServer('start');
        }
        
        // Ctrl + T - Toggle Theme
        if (e.ctrlKey && e.shiftKey && e.key === 't') {
          e.preventDefault();
          toggleTheme();
        }
        
        // Ctrl + L - Clear Logs
        if (e.ctrlKey && e.key === 'l') {
          e.preventDefault();
          clearLogs();
        }
      });
    }

    function openCommandPalette() {
      document.getElementById('overlay').classList.add('active');
      document.getElementById('commandPalette').classList.add('active');
      document.getElementById('commandInput').focus();
    }

    function closeCommandPalette() {
      document.getElementById('overlay').classList.remove('active');
      document.getElementById('commandPalette').classList.remove('active');
      document.getElementById('commandInput').value = '';
    }

    function executeCommand(index) {
      if (window.commands && window.commands[index]) {
        window.commands[index].action();
        closeCommandPalette();
      }
    }

    function filterCommands(e) {
      const query = e.target.value.toLowerCase();
      const items = document.querySelectorAll('.command-item');
      
      items.forEach(item => {
        const name = item.querySelector('.command-name').textContent.toLowerCase();
        const desc = item.querySelector('.command-desc').textContent.toLowerCase();
        
        if (name.includes(query) || desc.includes(query)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    }

    // Theme Toggle
    function toggleTheme() {
      document.body.classList.toggle('light-mode');
      const isLight = document.body.classList.contains('light-mode');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      
      // Update icon
      const icon = document.querySelector('.theme-toggle-slider i');
      icon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
      lucide.createIcons();
      
      showNotification(\`Tema \${isLight ? 'claro' : 'oscuro'} activado\`, 'success');
    }

    function loadThemePreference() {
      const theme = localStorage.getItem('theme');
      if (theme === 'light') {
        document.body.classList.add('light-mode');
        const icon = document.querySelector('.theme-toggle-slider i');
        icon.setAttribute('data-lucide', 'sun');
        lucide.createIcons();
      }
    }

    // Server Control
    async function controlServer(action) {
      const buttons = document.querySelectorAll('.btn');
      buttons.forEach(btn => btn.disabled = true);

      const messages = {
        start: 'Iniciando servidor...',
        restart: 'Reiniciando servidor...',
        stop: 'Deteniendo servidor...'
      };

      showNotification(messages[action], 'info');

      try {
        const response = await fetch('/api/' + action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const result = await response.json();
        
        if (result.success) {
          showNotification(result.message, 'success');
          if (action !== 'stop') {
            setTimeout(function() { location.reload(); }, 2000);
          }
        } else {
          showNotification('Error: ' + result.message, 'error', 5000);
        }
      } catch (error) {
        showNotification('Error de conexión: ' + error.message, 'error', 5000);
      } finally {
        setTimeout(() => {
          buttons.forEach(btn => btn.disabled = false);
        }, 2000);
      }
    }

    // Notifications
    function showNotification(message, type = 'info', duration = 3000) {
      const notification = document.getElementById('notification');
      
      const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info'
      };
      
      const colors = {
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        info: 'var(--color-info)'
      };
      
      notification.innerHTML = \`
        <i data-lucide="\${icons[type]}" style="width: 20px; height: 20px; color: \${colors[type]};"></i>
        <span>\${message}</span>
      \`;
      
      notification.classList.add('show');
      lucide.createIcons();
      
      setTimeout(() => {
        notification.classList.remove('show');
      }, duration);
    }

    // Utility Functions
    function getStatusInfo(status) {
      const states = {
        starting: { 
          icon: 'loader', 
          text: 'INICIANDO', 
          color: '#9e9e9e', 
          bgColor: 'rgba(158, 158, 158, 0.1)',
          desc: 'El servidor se está preparando...' 
        },
        waiting_camera: { 
          icon: 'alert-circle', 
          text: 'ESPERANDO CÁMARA', 
          color: '#ffa726', 
          bgColor: 'rgba(255, 167, 38, 0.1)',
          desc: 'Servidor activo, sin señal de cámara' 
        },
        camera_only: { 
          icon: 'camera', 
          text: 'CÁMARA SIN OBS', 
          color: '#ff9800', 
          bgColor: 'rgba(255, 152, 0, 0.1)',
          desc: 'Cámara conectada, esperando OBS' 
        },
        obs_waiting_camera: { 
          icon: 'monitor', 
          text: 'OBS SIN CÁMARA', 
          color: '#42a5f5', 
          bgColor: 'rgba(66, 165, 245, 0.1)',
          desc: 'OBS conectado, esperando señal de cámara' 
        },
        streaming: { 
          icon: 'radio', 
          text: 'TRANSMITIENDO', 
          color: '#4caf50', 
          bgColor: 'rgba(76, 175, 80, 0.1)',
          desc: '¡Todo funcionando correctamente!' 
        },
        error: { 
          icon: 'alert-triangle', 
          text: 'ERROR', 
          color: '#f44336', 
          bgColor: 'rgba(244, 67, 54, 0.1)',
          desc: 'Se detectó un problema' 
        }
      };
      return states[status] || states.waiting_camera;
    }

    function getTimeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      if (seconds < 60) return \`hace \${seconds} segundos\`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return \`hace \${minutes} minuto\${minutes > 1 ? 's' : ''}\`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return \`hace \${hours} hora\${hours > 1 ? 's' : ''}\`;
      const days = Math.floor(hours / 24);
      return \`hace \${days} día\${days > 1 ? 's' : ''}\`;
    }

    function formatUptime(seconds) {
      if (seconds < 60) return \`\${seconds}s\`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return \`\${minutes}m\`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hours < 24) return \`\${hours}h \${mins}m\`;
      const days = Math.floor(hours / 24);
      const hrs = hours % 24;
      return \`\${days}d \${hrs}h\`;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function exportLogs() {
      const logs = document.getElementById('logsContainer').textContent;
      const blob = new Blob([logs], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`rtmp-logs-\${new Date().toISOString().split('T')[0]}.txt\`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('Logs exportados', 'success');
    }

    function changeTimeRange(range) {
      // Update active button
      document.querySelectorAll('.chart-filters .filter-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      event.target.classList.add('active');
      
      // In a real implementation, this would fetch historical data
      showNotification(\`Vista cambiada a \${range}\`, 'info');
    }

    // Auto-refresh icons
    setInterval(() => {
      lucide.createIcons();
    }, 5000);
  </script>
</body>
</html>
`;
}

export {
  renderStatusPage
};