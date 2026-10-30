import os from 'node:os';

const BYTES_PER_MB = 1024 * 1024;

function cpuSnapshot() {
  let idle = 0;
  let total = 0;

  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }

  return { idle, total, at: Date.now() };
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Muestreador real de CPU y memoria. `os.loadavg()` devuelve ceros en Windows,
 * por eso la CPU se calcula con la diferencia de tiempos entre muestras.
 */
export function createMetricsSampler() {
  let previous = cpuSnapshot();

  return function sample() {
    const current = cpuSnapshot();
    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;

    const cpu = totalDelta > 0 ? Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100)) : 0;
    previous = current;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);

    return {
      cpu: round(cpu),
      memoryMB: Math.round(usedMem / BYTES_PER_MB),
      memoryTotalMB: Math.round(totalMem / BYTES_PER_MB),
      memoryPercent: round(totalMem > 0 ? (usedMem / totalMem) * 100 : 0),
      processRssMB: Math.round(process.memoryUsage().rss / BYTES_PER_MB),
      bitrate: 0,
      sampledAt: current.at,
    };
  };
}
