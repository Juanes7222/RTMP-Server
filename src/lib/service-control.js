import { execFile } from 'node:child_process';

// Códigos numéricos de `sc query`: son independientes del idioma de Windows.
const STATE_CODES = {
  1: 'stopped',
  2: 'starting',
  3: 'stopping',
  4: 'running',
  5: 'starting',
  6: 'stopping',
  7: 'paused',
};

const NOT_INSTALLED = /(?:FAILED\s+1060|1060|no se encuentra|does not exist)/i;

function runSc(args, timeout = 15_000) {
  return new Promise((resolve) => {
    execFile('sc.exe', args, { windowsHide: true, timeout }, (error, stdout = '', stderr = '') => {
      resolve({ ok: !error, stdout, stderr, error });
    });
  });
}

function firstErrorLine(output) {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /FAILED|ERROR|denegado|denied/i.test(entry));
  return line ?? null;
}

/**
 * Controla un servicio de Windows con `sc.exe` (sin abrir PowerShell, que
 * tardaba ~500 ms por comando) y cachea el estado unos segundos.
 */
export class ServiceControl {
  #name;
  #cacheMs;
  #cache = { at: 0, status: 'unknown' };

  constructor({ name, cacheMs = 2000 }) {
    this.#name = name;
    this.#cacheMs = cacheMs;
  }

  get name() {
    return this.#name;
  }

  async status({ force = false } = {}) {
    if (process.platform !== 'win32') return 'unsupported';
    if (!force && Date.now() - this.#cache.at < this.#cacheMs) return this.#cache.status;

    const { stdout, stderr } = await runSc(['query', this.#name]);
    const output = `${stdout}\n${stderr}`;

    let status = 'unknown';
    if (NOT_INSTALLED.test(output)) {
      status = 'not_installed';
    } else {
      const match = output.match(/(?:STATE|ESTADO)\s*:\s*(\d+)/i);
      if (match) status = STATE_CODES[Number(match[1])] ?? 'unknown';
    }

    this.#cache = { at: Date.now(), status };
    return status;
  }

  async waitFor(target, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.status({ force: true });
      if (status === target) return true;
      if (status === 'not_installed' || status === 'unsupported') return false;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }

  async start() {
    if (process.platform !== 'win32') {
      return { success: false, message: 'El control de servicios solo está disponible en Windows', status: 'unsupported' };
    }

    const current = await this.status({ force: true });
    if (current === 'running') return { success: true, message: 'El servicio ya está en ejecución', status: current };
    if (current === 'not_installed') {
      return { success: false, message: `El servicio ${this.#name} no está instalado`, status: current };
    }

    const { stdout, stderr, ok } = await runSc(['start', this.#name]);
    const status = await this.status({ force: true });
    if (!ok && status !== 'running') {
      return { success: false, message: firstErrorLine(`${stdout}\n${stderr}`) ?? 'No se pudo iniciar el servicio', status };
    }

    return { success: true, message: 'Servicio iniciado', status };
  }

  async stop() {
    if (process.platform !== 'win32') {
      return { success: false, message: 'El control de servicios solo está disponible en Windows', status: 'unsupported' };
    }

    const current = await this.status({ force: true });
    if (current === 'stopped') return { success: true, message: 'El servicio ya está detenido', status: current };

    const { stdout, stderr, ok } = await runSc(['stop', this.#name]);
    const stopped = await this.waitFor('stopped');
    const status = await this.status({ force: true });

    if (!ok && !stopped) {
      return { success: false, message: firstErrorLine(`${stdout}\n${stderr}`) ?? 'No se pudo detener el servicio', status };
    }

    return { success: true, message: 'Servicio detenido', status };
  }

  async restart() {
    if (process.platform !== 'win32') {
      return { success: false, message: 'El control de servicios solo está disponible en Windows', status: 'unsupported' };
    }

    const stopResult = await this.stop();
    if (!stopResult.success) return stopResult;

    return this.start();
  }
}
