import os from 'node:os';

const PRIVATE_PREFIXES = ['192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.2', '172.30.', '172.31.'];

/**
 * Devuelve la IPv4 LAN con la que las cámaras/OBS alcanzan este equipo.
 * Prioriza direcciones privadas para no mostrar adaptadores virtuales.
 */
export function getLocalIP() {
  const found = [];

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      found.push(iface.address);
    }
  }

  return found.find((ip) => PRIVATE_PREFIXES.some((prefix) => ip.startsWith(prefix))) ?? found[0] ?? '127.0.0.1';
}
