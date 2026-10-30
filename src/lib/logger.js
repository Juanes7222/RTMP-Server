import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { debug: 10, info: 20, success: 20, warn: 30, error: 40 };
const COLORS = { debug: '\x1b[90m', info: '\x1b[36m', success: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

/**
 * Logger ligero por proceso. Cada proceso escribe en su propio archivo
 * (dashboard.log / rtmp.log) para evitar escrituras entrelazadas y
 * condiciones de carrera en la rotación.
 */
export function createLogger({
  name = 'app',
  file = null,
  level = 'info',
  maxBytes = 5 * 1024 * 1024,
  keep = 5,
  logToConsole = true,
} = {}) {
  const minLevel = LEVELS[level] ?? LEVELS.info;
  let stream = null;
  let written = 0;
  let broken = false;

  function openStream() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      stream = fs.createWriteStream(file, { flags: 'a' });
      stream.on('error', (err) => {
        broken = true;
        console.error(`[logger] No se puede escribir en ${file}: ${err.message}`);
      });
    } catch (err) {
      broken = true;
      console.error(`[logger] No se puede abrir ${file}: ${err.message}`);
    }
  }

  function rotate() {
    try {
      stream?.end();
      stream = null;

      fs.rmSync(`${file}.${keep}`, { force: true });
      for (let index = keep - 1; index >= 1; index -= 1) {
        const from = `${file}.${index}`;
        if (fs.existsSync(from)) fs.renameSync(from, `${file}.${index + 1}`);
      }
      if (fs.existsSync(file)) fs.renameSync(file, `${file}.1`);
    } catch {
      // La rotación nunca debe tumbar el servicio.
    }

    written = 0;
    openStream();
  }

  function write(levelName, message) {
    if ((LEVELS[levelName] ?? LEVELS.info) < minLevel) return;

    const text = typeof message === 'string' ? message : String(message);
    const line = `[${new Date().toISOString()}] [${levelName.toUpperCase()}] [${name}] ${text}`;

    if (logToConsole) {
      const output = levelName === 'error' || levelName === 'warn' ? console.error : console.log;
      output(`${COLORS[levelName] ?? ''}${line}${RESET}`);
    }

    if (!file || broken) return;
    if (!stream) openStream();
    if (!stream) return;

    stream.write(`${line}\n`);
    written += Buffer.byteLength(line) + 1;
    if (written >= maxBytes) rotate();
  }

  return {
    name,
    file,
    debug: (message) => write('debug', message),
    info: (message) => write('info', message),
    success: (message) => write('success', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
    close() {
      if (!stream) return Promise.resolve();
      const pending = stream;
      stream = null;
      return new Promise((resolve) => pending.end(resolve));
    },
  };
}
