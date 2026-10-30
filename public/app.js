/* Panel RTMP — cliente sin dependencias externas */
'use strict';

(() => {
  const MAX_LOGS = 1000;
  const MAX_HISTORY = 900;
  const MAX_FEED = 50;
  const MAX_LOG_ROWS = 400;

  const $ = (id) => document.getElementById(id);

  const STATUS = {
    starting: { word: 'INICIANDO', desc: 'El servidor está arrancando.' },
    waiting_camera: { word: 'SIN SEÑAL', desc: 'El servidor está listo. La cámara no está enviando video.' },
    camera_only: { word: 'CÁMARA ENVIANDO', desc: 'La cámara envía video. Falta que OBS se conecte.' },
    obs_waiting_camera: { word: 'ESPERANDO CÁMARA', desc: 'OBS está conectado. Falta la señal de la cámara.' },
    streaming: { word: 'EN AIRE', desc: 'La señal llega de la cámara a OBS.' },
    stopped: { word: 'FUERA DE SERVICIO', desc: 'El servidor RTMP está detenido.' },
    error: { word: 'ERROR', desc: 'Hay un problema en el sistema.' },
  };

  const SERVICE = {
    running: 'En ejecución',
    stopped: 'Detenido',
    starting: 'Iniciando',
    stopping: 'Deteniendo',
    paused: 'Pausado',
    not_installed: 'No instalado',
    unsupported: 'No disponible',
    unknown: 'Consultando',
  };

  const CHART_METRICS = {
    bitrate: { unit: 'Mb/s', fixedMax: null, decimals: 2, colorVar: '--cyan' },
    cpu: { unit: '%', fixedMax: 100, decimals: 0, colorVar: '--amber' },
    memory: { unit: '%', fixedMax: 100, decimals: 0, colorVar: '--emerald' },
  };

  const nf2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Etiquetas cortas para que la columna de nivel no corte palabras.
  const LOG_TAG = { error: 'ERR', warn: 'WARN', success: 'OK', info: 'INFO', debug: 'DBG' };

  const view = {
    state: null,
    metrics: null,
    service: 'unknown',
    meta: { rtmpPort: 1935 },
    logs: [],
    activities: [],
    history: [],
    metric: 'bitrate',
    range: 60,
    logLevel: 'all',
    logQuery: '',
    follow: true,
    pending: null,
    connected: false,
    uptimeAnchor: null,
  };

  // ───────────────────────────── utilidades ─────────────────────────────

  function timecode(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  function timeAgo(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 10) return 'ahora';
    if (seconds < 60) return `hace ${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.floor(hours / 24)} d`;
  }

  function parseLog(line) {
    const match = /^\[([^\]]+)\]\s+\[([A-Z]+)\]\s+\[([^\]]+)\]\s?([\s\S]*)$/.exec(line);
    if (!match) return { time: '', level: 'info', source: '', text: line };
    return { time: match[1], level: match[2].toLowerCase(), source: match[3], text: match[4] };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function niceMax(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = Math.floor(Math.log10(value));
    const base = 10 ** exponent;
    const normalized = value / base;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * base;
  }

  /** Convierte un color del tema (#rgb, #rrggbb, rgb()) a rgba con alfa. */
  function withAlpha(color, alpha) {
    const value = color.trim();
    if (value.startsWith('#')) {
      const hex = value.slice(1);
      const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
      const num = Number.parseInt(full, 16);
      if (!Number.isFinite(num)) return value;
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return value;
  }

  function formatValue(metric, value) {
    const cfg = CHART_METRICS[metric];
    return cfg.decimals === 0 ? String(Math.round(value)) : nf2.format(value);
  }

  // ───────────────────────────── WebSocket ─────────────────────────────

  let socket = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  function connect() {
    clearTimeout(reconnectTimer);
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${protocol}://${location.host}/ws`);

    socket.onopen = () => {
      reconnectAttempts = 0;
      setConnected(true);
    };
    socket.onclose = () => {
      setConnected(false);
      scheduleReconnect();
    };
    socket.onerror = () => socket?.close();
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      handleMessage(message);
    };
  }

  function scheduleReconnect() {
    reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 10_000);
    reconnectTimer = setTimeout(connect, delay);
  }

  function setConnected(connected) {
    view.connected = connected;
    $('connLink').classList.toggle('is-down', !connected);
    $('connText').textContent = connected ? 'Panel conectado' : 'Reconectando';
  }

  function handleMessage({ type, data }) {
    switch (type) {
      case 'hello':
        view.state = data.state;
        view.service = data.service?.status ?? 'unknown';
        view.meta = data.meta ?? view.meta;
        view.logs = Array.isArray(data.logs) ? data.logs.slice(-MAX_LOGS) : [];
        view.activities = Array.isArray(data.state?.activities) ? data.state.activities.slice(0, MAX_FEED) : [];
        view.history = [];
        $('urlBox').textContent = streamUrl();
        updateServerAddress();
        renderAll();
        break;

      case 'state':
        view.state = data;
        renderState();
        break;

      case 'metrics':
        view.metrics = data;
        if (data?.sampledAt) {
          view.history.push({
            t: data.sampledAt,
            bitrate: Number(data.bitrate) || 0,
            cpu: Number(data.cpu) || 0,
            memory: Number(data.memoryPercent) || 0,
          });
          if (view.history.length > MAX_HISTORY) view.history.splice(0, view.history.length - MAX_HISTORY);
        }
        renderMetrics();
        scheduleChart();
        break;

      case 'activity':
        view.activities.unshift(data);
        if (view.activities.length > MAX_FEED) view.activities.length = MAX_FEED;
        renderFeed();
        break;

      case 'logs':
        if (!Array.isArray(data) || data.length === 0) break;
        view.logs.push(...data);
        if (view.logs.length > MAX_LOGS) view.logs.splice(0, view.logs.length - MAX_LOGS);
        scheduleLogs();
        break;

      case 'service':
        view.service = data.status;
        renderService();
        updateControls();
        break;

      default:
        break;
    }
  }

  // ───────────────────────────── render ─────────────────────────────

  function renderAll() {
    renderState();
    renderMetrics();
    renderFeed();
    renderLogs();
    scheduleChart();
  }

  function renderState() {
    const state = view.state;
    if (!state) return;

    const meta = STATUS[state.status] ?? STATUS.error;
    $('monitor').dataset.state = state.status ?? 'error';
    document.body.dataset.state = state.status ?? 'error';
    $('statusWord').textContent = meta.word;
    $('statusDesc').textContent = meta.desc;

    $('lastEvent').textContent = state.lastEvent
      ? `${state.lastEvent} (${timeAgo(state.lastEventTime)})`
      : 'Sin eventos todavía.';

    const cameraUp = Boolean(state.cameraConnected);
    const serverUp = Boolean(state.rtmp?.alive);
    const obsUp = Boolean(state.obsConnected);

    $('nodeCamera').classList.toggle('is-up', cameraUp);
    $('nodeServer').classList.toggle('is-up', serverUp);
    $('nodeObs').classList.toggle('is-up', obsUp);
    $('linkA').classList.toggle('is-live', cameraUp && serverUp);
    $('linkB').classList.toggle('is-live', serverUp && obsUp);

    $('cameraAddr').textContent = cameraUp ? state.cameraIP ?? 'conectada' : 'sin conexión';
    $('obsAddr').textContent = obsUp ? state.obsIP ?? 'conectado' : 'sin conexión';

    const stream = state.stream ?? {};
    // Un ID numérico suelto (7) es el formato antiguo: mejor no mostrarlo.
    const codec = /^\d+$/.test(String(stream.videoCodec ?? '')) ? '' : stream.videoCodec;
    $('streamInfo').textContent = stream.width
      ? `${stream.width}×${stream.height} · ${Math.round(stream.fps || 0)} fps${codec ? ` · ${codec}` : ''}`
      : 'Sin datos';
    $('players').textContent = String(state.players ?? 0);
    $('processRss').textContent = `${Math.round(state.metrics?.processRssMB ?? 0)} MB`;

    if (typeof state.uptime === 'number') {
      view.uptimeAnchor = { seconds: state.uptime, at: Date.now() };
      tickUptime();
    }

    renderService();
    updateControls();
  }

  function renderService() {
    const label = SERVICE[view.service] ?? view.service;
    $('serviceText').textContent = label;

    const led = $('serviceLed');
    led.classList.remove('is-up', 'is-standby', 'is-down');
    if (view.service === 'running') led.classList.add('is-up');
    else if (view.service === 'starting' || view.service === 'stopping') led.classList.add('is-standby');
    else if (view.service === 'stopped' || view.service === 'not_installed') led.classList.add('is-down');
  }

  function renderMetrics() {
    const state = view.state;
    const metrics = view.metrics ?? state?.metrics;
    if (!metrics) return;

    const bitrate = Number(metrics.bitrate) || 0;
    const cpu = Math.min(100, Math.max(0, Number(metrics.cpu) || 0));
    const memory = Math.min(100, Math.max(0, Number(metrics.memoryPercent) || 0));

    $('readBitrate').textContent = nf2.format(bitrate);
    $('readCpu').textContent = String(Math.round(cpu));
    $('readMemory').textContent = String(Math.round(memory));
    $('meterBitrate').style.width = `${Math.min(100, (bitrate / 8) * 100)}%`;
    $('meterCpu').style.width = `${cpu}%`;
    $('meterMemory').style.width = `${memory}%`;

    // El tiempo en marcha lo manda el estado (uptime real del panel); la
    // primera muestra de métricas trae uptime 0 y falsearía el contador.
  }

  function tickUptime() {
    if (!view.uptimeAnchor) return;
    const elapsed = Math.floor((Date.now() - view.uptimeAnchor.at) / 1000);
    $('readUptime').textContent = timecode(view.uptimeAnchor.seconds + elapsed);
  }

  function updateServerAddress() {
    $('serverAddr').textContent = `puerto ${view.meta.rtmpPort ?? 1935}`;
  }

  function updateControls() {
    const running = view.service === 'running';
    const stopped = ['stopped', 'not_installed', 'unsupported'].includes(view.service);
    const pending = Boolean(view.pending);

    $('btnStart').disabled = pending || running;
    $('btnRestart').disabled = pending || view.service === 'not_installed' || view.service === 'unsupported';
    $('btnStop').disabled = pending || stopped;
  }

  function renderFeed() {
    const container = $('feed');

    if (view.activities.length === 0) {
      container.innerHTML = '<li class="feed-empty">Aún no hay eventos. Cuando la cámara u OBS se conecten aparecerán aquí.</li>';
      return;
    }

    container.innerHTML = view.activities
      .map((activity) => {
        const type = ['success', 'warning', 'error', 'info'].includes(activity.type) ? activity.type : 'info';
        return `<li class="feed-item ${type}">
            <span class="feed-mark" aria-hidden="true"></span>
            <p class="feed-text">${escapeHtml(activity.message ?? '')}</p>
            <span class="feed-time">${escapeHtml(timeAgo(activity.timestamp))}</span>
          </li>`;
      })
      .join('');
  }

  let logsQueued = false;

  function scheduleLogs() {
    if (logsQueued) return;
    logsQueued = true;
    requestAnimationFrame(() => {
      logsQueued = false;
      renderLogs();
    });
  }

  function filteredLogs() {
    const query = view.logQuery.trim().toLowerCase();
    return view.logs.filter((line) => {
      const { level } = parseLog(line);
      if (view.logLevel === 'error' && level !== 'error') return false;
      if (view.logLevel === 'warn' && !['warn', 'warning'].includes(level)) return false;
      if (view.logLevel === 'info' && !['info', 'success', 'debug'].includes(level)) return false;
      return !query || line.toLowerCase().includes(query);
    });
  }

  function renderLogs() {
    const container = $('logs');
    const lines = filteredLogs();
    const visible = lines.slice(-MAX_LOG_ROWS);

    if (visible.length === 0) {
      $('logCount').textContent = '0 líneas';
      container.innerHTML = '<p class="log-empty">El registro está vacío.</p>';
      return;
    }

    container.innerHTML = visible
      .map((line) => {
        const parsed = parseLog(line);
        const level = ['error', 'warn', 'success', 'info', 'debug'].includes(parsed.level) ? parsed.level : 'info';
        const time = parsed.time && !Number.isNaN(new Date(parsed.time).getTime())
          ? new Date(parsed.time).toLocaleTimeString('es-ES', { hour12: false })
          : parsed.time;

        return `<div class="log-row ${level}">
            <span class="log-time">${escapeHtml(time)}</span>
            <span class="log-level">${LOG_TAG[level] ?? 'INFO'}</span>
            <span class="log-text">${escapeHtml(parsed.source ? `${parsed.source}: ${parsed.text}` : parsed.text)}</span>
          </div>`;
      })
      .join('');

    $('logCount').textContent = `${lines.length} de ${view.logs.length} líneas`;
    if (view.follow) container.scrollTop = container.scrollHeight;
  }

  // ───────────────────────────── gráfico ─────────────────────────────

  let chartQueued = false;

  function scheduleChart() {
    if (chartQueued) return;
    chartQueued = true;
    requestAnimationFrame(() => {
      chartQueued = false;
      drawChart();
    });
  }

  function drawChart() {
    const canvas = $('chart');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 120);
    const height = Math.max(rect.height, 120);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const gridColor = styles.getPropertyValue('--border-strong').trim() || 'rgba(148,163,184,.3)';
    const axisColor = styles.getPropertyValue('--faint').trim() || '#71809d';
    const cfg = CHART_METRICS[view.metric];
    const traceColor = styles.getPropertyValue(cfg.colorVar).trim() || styles.getPropertyValue('--cyan').trim() || '#22d3ee';
    const cutoff = Date.now() - view.range * 1000;
    const points = view.history.filter((point) => point.t >= cutoff).map((point) => point[view.metric]);

    const hasPoints = points.length > 0;
    $('chartEmpty').hidden = points.length > 1;

    const padding = { top: 20, right: 10, bottom: 10, left: 40 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;

    const maxValue = cfg.fixedMax ?? niceMax(Math.max(0, ...points));

    for (let index = 0; index <= 3; index += 1) {
      const y = padding.top + (plotHeight / 3) * index;
      ctx.strokeStyle = gridColor;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      if (!hasPoints) continue;
      ctx.fillStyle = axisColor;
      ctx.fillText(formatValue(view.metric, maxValue - (maxValue / 3) * index), 2, y);
    }

    if (!hasPoints) {
      $('sumNow').textContent = '—';
      $('sumAvg').textContent = '—';
      $('sumMax').textContent = '—';
      return;
    }

    ctx.fillStyle = axisColor;
    ctx.fillText(cfg.unit, padding.left + 2, 8);

    if (points.length < 2) return;

    const stepX = plotWidth / (points.length - 1);
    const xAt = (index) => padding.left + stepX * index;
    const yAt = (value) => padding.top + plotHeight - (Math.min(value, maxValue) / maxValue) * plotHeight;
    const coords = points.map((value, index) => ({ x: xAt(index), y: yAt(value) }));

    // Curva suave (Catmull-Rom convertida a Bézier) en lugar de segmentos rectos.
    const tracePath = () => {
      ctx.moveTo(coords[0].x, coords[0].y);
      for (let index = 0; index < coords.length - 1; index += 1) {
        const previous = coords[index - 1] ?? coords[index];
        const from = coords[index];
        const to = coords[index + 1];
        const next = coords[index + 2] ?? to;
        ctx.bezierCurveTo(
          from.x + (to.x - previous.x) / 6,
          from.y + (to.y - previous.y) / 6,
          to.x - (next.x - from.x) / 6,
          to.y - (next.y - from.y) / 6,
          to.x,
          to.y,
        );
      }
    };

    // Área bajo la curva con degradado hacia el fondo.
    ctx.beginPath();
    tracePath();
    ctx.lineTo(coords[coords.length - 1].x, padding.top + plotHeight);
    ctx.lineTo(coords[0].x, padding.top + plotHeight);
    ctx.closePath();
    const areaFill = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotHeight);
    areaFill.addColorStop(0, withAlpha(traceColor, 0.2));
    areaFill.addColorStop(0.55, withAlpha(traceColor, 0.06));
    areaFill.addColorStop(1, withAlpha(traceColor, 0));
    ctx.fillStyle = areaFill;
    ctx.fill();

    // Traza con halo del color de la métrica.
    ctx.beginPath();
    tracePath();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = traceColor;
    ctx.shadowColor = withAlpha(traceColor, 0.55);
    ctx.shadowBlur = 9;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const lastPoint = coords[coords.length - 1];
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(traceColor, 0.18);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = traceColor;
    ctx.fill();

    const values = points;
    const current = values[values.length - 1];
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const max = Math.max(...values);
    const unit = cfg.unit;

    $('sumNow').textContent = `${formatValue(view.metric, current)} ${unit}`;
    $('sumAvg').textContent = `${formatValue(view.metric, average)} ${unit}`;
    $('sumMax').textContent = `${formatValue(view.metric, max)} ${unit}`;
  }

  // ───────────────────────────── acciones ─────────────────────────────

  async function control(action) {
    if (view.pending) return;

    if (action === 'stop' && !window.confirm('Se cortará la transmisión en curso. ¿Detener el servidor RTMP?')) return;
    if (action === 'restart' && !window.confirm('La transmisión se cortará unos segundos. ¿Reiniciar el servidor RTMP?')) return;

    view.pending = action;
    updateControls();
    toast('info', `${action === 'start' ? 'Iniciando' : action === 'stop' ? 'Deteniendo' : 'Reiniciando'} el servidor…`);

    try {
      const response = await fetch(`/api/${action}`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `El panel respondió con el código ${response.status}`);

      toast(data.success ? 'success' : 'error', data.message ?? 'El servicio no devolvió respuesta.');

      if (data.service) {
        view.service = data.service;
        renderService();
      }
    } catch (error) {
      toast('error', error.message || 'No se pudo contactar con el panel. Revisa que el servicio esté en ejecución.');
    } finally {
      view.pending = null;
      updateControls();
    }
  }

  function streamUrl() {
    const port = view.meta.rtmpPort ?? 1935;
    return `rtmp://${location.hostname}:${port}/live/stream`;
  }

  async function copyStreamUrl() {
    const url = streamUrl();
    const button = $('copyBtn');

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const temporary = document.createElement('textarea');
      temporary.value = url;
      document.body.appendChild(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
    }

    button.textContent = 'Copiada';
    setTimeout(() => {
      button.textContent = 'Copiar';
    }, 1600);
  }

  function downloadLogs() {
    const lines = filteredLogs();
    if (lines.length === 0) {
      toast('warning', 'No hay líneas que descargar con el filtro actual.');
      return;
    }

    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rtmp-registro-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast('success', `${lines.length} líneas descargadas.`);
  }

  // ───────────────────────────── avisos ─────────────────────────────

  function toast(type, message) {
    const container = $('toasts');
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = message;
    container.appendChild(element);

    setTimeout(() => element.remove(), 4200);
  }

  // ───────────────────────────── tema ─────────────────────────────

  function applyTheme(theme, { notify = false } = {}) {
    const resolved = theme === 'noche' ? 'noche' : 'dia';
    document.documentElement.dataset.theme = resolved;
    $('themeIcon').setAttribute('href', `#i-${resolved === 'noche' ? 'sun' : 'moon'}`);
    localStorage.setItem('rtmp-theme', resolved);
    if (notify) toast('info', `Modo ${resolved === 'noche' ? 'noche' : 'día'} activado.`);
    scheduleChart();
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === 'noche' ? 'dia' : 'noche', { notify: true });
  }

  function storedTheme() {
    const stored = localStorage.getItem('rtmp-theme');
    if (stored === 'noche' || stored === 'dia') return stored;
    if (stored === 'dark') return 'noche';
    if (stored === 'light') return 'dia';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'noche' : 'dia';
  }

  // ───────────────────────────── paleta ─────────────────────────────

  const COMMANDS = [
    { name: 'Iniciar servidor', desc: 'Arranca el servicio RTMP', run: () => control('start') },
    { name: 'Reiniciar servidor', desc: 'Corta y vuelve a arrancar', run: () => control('restart') },
    { name: 'Detener servidor', desc: 'Corta la transmisión', run: () => control('stop') },
    { name: 'Copiar dirección de publicación', desc: streamUrl(), run: copyStreamUrl },
    { name: 'Descargar registro', desc: 'Exporta las líneas filtradas', run: downloadLogs },
    { name: 'Buscar en el registro', desc: 'Lleva el cursor al buscador', run: () => $('logSearch').focus() },
    { name: 'Cambiar tema', desc: 'Alterna día y noche', run: toggleTheme },
  ];

  let paletteIndex = 0;
  let paletteResults = COMMANDS;

  function filterCommands() {
    const query = $('paletteInput').value.trim().toLowerCase();
    paletteResults = COMMANDS.filter(
      (command) => !query || command.name.toLowerCase().includes(query) || command.desc.toLowerCase().includes(query),
    );
    paletteIndex = 0;
    renderPalette();
  }

  function renderPalette() {
    $('paletteList').innerHTML = paletteResults.length
      ? paletteResults
          .map(
            (command, index) => `<li class="palette-item ${index === paletteIndex ? 'selected' : ''}" data-index="${index}">
                <span class="palette-name">${escapeHtml(command.name)}</span>
                <span class="palette-desc">${escapeHtml(command.desc)}</span>
                <kbd>Enter</kbd>
              </li>`,
          )
          .join('')
      : '<li class="palette-empty">Ningún comando coincide.</li>';

    $('paletteList').querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function openPalette() {
    $('paletteOverlay').hidden = false;
    $('palette').hidden = false;
    $('paletteInput').value = '';
    filterCommands();
    $('paletteInput').focus();
  }

  function closePalette() {
    $('paletteOverlay').hidden = true;
    $('palette').hidden = true;
  }

  function runCommand(index) {
    const command = paletteResults[index];
    closePalette();
    if (command) command.run();
  }

  // ───────────────────────────── eventos ─────────────────────────────

  function bindTabs(containerId, attribute, onSelect) {
    $(containerId).addEventListener('click', (event) => {
      const button = event.target.closest(`button[data-${attribute}]`);
      if (!button) return;
      for (const sibling of $(containerId).children) {
        const active = sibling === button;
        sibling.classList.toggle('active', active);
        sibling.setAttribute('aria-selected', String(active));
      }
      onSelect(button.dataset[attribute]);
    });
  }

  function bindEvents() {
    $('themeBtn').addEventListener('click', toggleTheme);
    $('paletteBtn').addEventListener('click', openPalette);
    $('paletteClose').addEventListener('click', closePalette);
    $('paletteOverlay').addEventListener('click', closePalette);
    $('paletteInput').addEventListener('input', filterCommands);

    $('paletteList').addEventListener('click', (event) => {
      const item = event.target.closest('.palette-item');
      if (item) runCommand(Number(item.dataset.index));
    });

    $('btnStart').addEventListener('click', () => control('start'));
    $('btnRestart').addEventListener('click', () => control('restart'));
    $('btnStop').addEventListener('click', () => control('stop'));
    $('copyBtn').addEventListener('click', copyStreamUrl);
    $('logDownload').addEventListener('click', downloadLogs);

    bindTabs('chartMetric', 'metric', (value) => {
      view.metric = value;
      drawChart();
    });

    bindTabs('chartRange', 'range', (value) => {
      view.range = Number(value);
      drawChart();
    });

    bindTabs('logLevel', 'level', (value) => {
      view.logLevel = value;
      renderLogs();
    });

    $('logSearch').addEventListener('input', (event) => {
      view.logQuery = event.target.value;
      renderLogs();
    });

    $('logFollow').addEventListener('change', (event) => {
      view.follow = event.target.checked;
      if (view.follow) $('logs').scrollTop = $('logs').scrollHeight;
    });

    document.addEventListener('keydown', (event) => {
      const paletteOpen = !$('palette').hidden;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (paletteOpen) closePalette();
        else openPalette();
        return;
      }

      if (!paletteOpen) return;

      if (event.key === 'Escape') {
        closePalette();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (paletteResults.length === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        paletteIndex = (paletteIndex + step + paletteResults.length) % paletteResults.length;
        renderPalette();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runCommand(paletteIndex);
      }
    });

    if ('ResizeObserver' in window) {
      new ResizeObserver(() => scheduleChart()).observe($('chart').parentElement);
    } else {
      window.addEventListener('resize', scheduleChart);
    }
  }

  function boot() {
    applyTheme(storedTheme());
    $('urlBox').textContent = streamUrl();
    bindEvents();
    setInterval(tickUptime, 1000);
    renderFeed();
    connect();
  }

  boot();
})();
