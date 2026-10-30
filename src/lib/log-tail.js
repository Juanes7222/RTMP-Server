import fs from 'node:fs';

const MAX_TAIL_BYTES = 512 * 1024;
const MAX_READ_BYTES = 256 * 1024;

/**
 * Lee las últimas `maxLines` líneas sin cargar el archivo completo.
 */
export function readTail(file, maxLines = 200) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) return [];

    const start = Math.max(0, stat.size - MAX_TAIL_BYTES);
    const length = stat.size - start;
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(file, 'r');

    try {
      fs.readSync(fd, buffer, 0, length, start);
    } finally {
      fs.closeSync(fd);
    }

    const lines = buffer.toString('utf8').split('\n');
    // Si empezamos a leer a mitad de archivo, la primera línea está cortada.
    if (start > 0) lines.shift();

    return lines
      .map((line) => line.replace(/\r$/, ''))
      .filter(Boolean)
      .slice(-maxLines);
  } catch {
    return [];
  }
}

/**
 * Vigila varios archivos de log de forma incremental.
 *
 * - Solo lee lo nuevo (cursor por archivo), nunca el archivo completo.
 * - Detecta rotación/truncado (tamaño menor al cursor o inodo distinto).
 * - Se arranca y detiene bajo demanda desde el dashboard: sin clientes
 *   WebSocket no hay sondeo de disco.
 */
export class LogTailer {
  #files;
  #pollMs;
  #maxLinesPerTick;
  #onLines;
  #cursors = new Map();
  #timer = null;
  #busy = false;

  constructor({ files = [], pollMs = 1000, maxLinesPerTick = 200, onLines = () => {} } = {}) {
    this.#files = files;
    this.#pollMs = pollMs;
    this.#maxLinesPerTick = maxLinesPerTick;
    this.#onLines = onLines;
  }

  get running() {
    return this.#timer !== null;
  }

  start() {
    if (this.#timer) return;
    for (const file of this.#files) {
      this.#cursors.set(file, { offset: this.#sizeOf(file), partial: '', ino: this.#inoOf(file) });
    }
    this.#timer = setInterval(() => void this.poll(), this.#pollMs);
    this.#timer.unref?.();
  }

  stop() {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = null;
    this.#cursors.clear();
  }

  async poll() {
    if (this.#busy) return;
    this.#busy = true;

    try {
      for (const file of this.#files) {
        const lines = await this.#readNewLines(file);
        if (lines.length > 0) this.#onLines(lines);
      }
    } finally {
      this.#busy = false;
    }
  }

  #sizeOf(file) {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  }

  #inoOf(file) {
    try {
      return fs.statSync(file).ino;
    } catch {
      return 0;
    }
  }

  async #readNewLines(file) {
    const cursor = this.#cursors.get(file);
    if (!cursor) return [];

    let stats;
    try {
      stats = await fs.promises.stat(file);
    } catch {
      cursor.offset = 0;
      cursor.partial = '';
      return [];
    }

    const rotated = stats.ino !== cursor.ino || stats.size < cursor.offset;
    if (rotated) {
      cursor.offset = 0;
      cursor.partial = '';
      cursor.ino = stats.ino;
    }

    if (stats.size === cursor.offset) return [];

    let start = cursor.offset;
    // Si se acumuló mucha cola (servicio detenido mucho tiempo), saltamos
    // el excedente para no inundar a los clientes.
    if (stats.size - start > MAX_READ_BYTES) start = stats.size - MAX_READ_BYTES;

    const handle = await fs.promises.open(file, 'r');
    try {
      const length = stats.size - start;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      cursor.offset = stats.size;

      const chunks = (cursor.partial + buffer.toString('utf8')).split('\n');
      cursor.partial = chunks.pop() ?? '';

      const lines = chunks
        .map((line) => line.replace(/\r$/, ''))
        .filter(Boolean)
        .slice(-this.#maxLinesPerTick);

      return lines;
    } finally {
      await handle.close();
    }
  }
}
