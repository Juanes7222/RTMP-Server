import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createMetricsSampler } from '../src/lib/metrics.js';
import { createFrameRateMeter } from '../src/lib/fps.js';
import { chooseEncoding } from '../src/lib/http.js';
import { LogTailer, readTail } from '../src/lib/log-tail.js';
import { DashboardState } from '../src/lib/state.js';
import { ServiceControl } from '../src/lib/service-control.js';

const tempDirs = [];

function tempDir(prefix = 'rtmp-lib-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('el muestreador de métricas devuelve valores reales y en rango', async () => {
  const sample = createMetricsSampler();

  // Entre muestras la CPU se calcula por diferencia de tiempos.
  const busyUntil = Date.now() + 120;
  while (Date.now() < busyUntil) {
    Math.sqrt(Math.random());
  }

  const metrics = sample();

  assert.ok(metrics.cpu >= 0 && metrics.cpu <= 100, `cpu fuera de rango: ${metrics.cpu}`);
  assert.ok(metrics.memoryPercent >= 0 && metrics.memoryPercent <= 100, 'porcentaje de memoria fuera de rango');
  assert.ok(metrics.memoryTotalMB > 0, 'la memoria total debe ser positiva');
  assert.ok(metrics.processRssMB > 0, 'el RSS del proceso debe ser positivo');
  assert.equal(typeof metrics.sampledAt, 'number');
});

test('readTail devuelve solo las últimas líneas del archivo', () => {
  const dir = tempDir('rtmp-tail-');
  const file = path.join(dir, 'app.log');
  const lines = Array.from({ length: 500 }, (_, index) => `linea-${index + 1}`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);

  const tail = readTail(file, 10);

  assert.equal(tail.length, 10);
  assert.equal(tail[0], 'linea-491');
  assert.equal(tail.at(-1), 'linea-500');
  assert.deepEqual(readTail(path.join(dir, 'no-existe.log'), 5), []);
});

test('LogTailer entrega solo las líneas nuevas y detecta truncado', async () => {
  const dir = tempDir('rtmp-tailer-');
  const file = path.join(dir, 'app.log');
  fs.writeFileSync(file, 'inicial\n');

  const received = [];
  const tailer = new LogTailer({ files: [file], onLines: (entries) => received.push(...entries) });

  tailer.start();
  assert.equal(tailer.running, true);

  fs.appendFileSync(file, '[2026-01-01T00:00:00.000Z] [INFO] [rtmp] primera\n');
  await tailer.poll();
  assert.deepEqual(received, ['[2026-01-01T00:00:00.000Z] [INFO] [rtmp] primera']);

  fs.appendFileSync(file, '[2026-01-01T00:00:01.000Z] [INFO] [rtmp] segunda\n');
  await tailer.poll();
  assert.equal(received.length, 2);

  // Rotación: el archivo se reemplaza por uno más pequeño.
  fs.writeFileSync(file, '[2026-01-01T00:00:02.000Z] [WARN] [rtmp] rotado\n');
  await tailer.poll();
  assert.equal(received.at(-1), '[2026-01-01T00:00:02.000Z] [WARN] [rtmp] rotado');

  tailer.stop();
  assert.equal(tailer.running, false);
});

test('el estado ignora parches inválidos y sanea actividades', () => {
  const state = new DashboardState();

  state.applyPatch({ status: 'inventado', cameraConnected: true, cameraIP: '192.168.1.20', lastEvent: 'x'.repeat(900) });
  const snapshot = state.snapshot();

  assert.equal(snapshot.status, 'starting', 'un estado desconocido no debe aplicarse');
  assert.equal(snapshot.cameraConnected, true);
  assert.equal(snapshot.cameraIP, '192.168.1.20');
  assert.ok(snapshot.lastEvent.length <= 300, 'el texto debe recortarse');
  assert.equal(snapshot.rtmp.alive, true);

  for (let index = 0; index < 70; index += 1) {
    state.addActivity({ type: 'info', message: `actividad ${index}` });
  }
  assert.equal(state.snapshot().activities.length, 50);

  state.markStopped('Servicio detenido');
  const stopped = state.snapshot();
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.cameraConnected, false);
  assert.equal(stopped.rtmp.alive, false);
  assert.equal(stopped.stream.bitrateKbps, 0);
});

test('el medidor de fps cuenta fotogramas por intervalo', () => {
  const meter = createFrameRateMeter();

  assert.equal(meter.sample(1000), 0, 'la primera muestra solo fija la base');

  for (let index = 0; index < 50; index += 1) meter.count();
  assert.equal(meter.sample(3000), 25, '50 fotogramas en 2 s son 25 fps');

  for (let index = 0; index < 25; index += 1) meter.count();
  assert.equal(meter.sample(4000), 25, '25 fotogramas en 1 s son 25 fps');

  meter.count();
  assert.equal(meter.sample(3500), 0, 'un reloj hacia atrás no produce valores absurdos');

  meter.reset(5000);
  for (let index = 0; index < 60; index += 1) meter.count();
  assert.equal(meter.sample(7000), 30, 'reset toma la base de tiempo indicada');
});

test('chooseEncoding negocia brotli, gzip e identity según q', () => {
  assert.equal(chooseEncoding('gzip, deflate, br'), 'br');
  assert.equal(chooseEncoding('gzip'), 'gzip');
  assert.equal(chooseEncoding(undefined), 'identity');
  assert.equal(chooseEncoding('br;q=0.5, gzip;q=0.9'), 'gzip');
  assert.equal(chooseEncoding('br;q=0, gzip;q=0, identity;q=1'), 'identity');
  assert.equal(chooseEncoding('*;q=0'), 'identity');
  assert.equal(chooseEncoding('identity;q=0, gzip'), 'gzip');
});

test('el estado deriva las conexiones del estado resumido', () => {
  const state = new DashboardState();

  state.applyPatch({ status: 'camera_only' });
  let snapshot = state.snapshot();
  assert.equal(snapshot.cameraConnected, true);
  assert.equal(snapshot.obsConnected, false);

  state.applyPatch({ status: 'streaming' });
  snapshot = state.snapshot();
  assert.equal(snapshot.cameraConnected, true);
  assert.equal(snapshot.obsConnected, true);

  // Un parche explícito manda sobre la derivación.
  state.applyPatch({ status: 'waiting_camera', cameraConnected: true, cameraIP: '192.168.1.9' });
  snapshot = state.snapshot();
  assert.equal(snapshot.cameraConnected, true);
  assert.equal(snapshot.cameraIP, '192.168.1.9');
  assert.equal(snapshot.obsConnected, false);
});

test('ServiceControl informa servicios inexistentes sin lanzar', { skip: process.platform !== 'win32' }, async () => {
  const control = new ServiceControl({ name: 'RTMP-Panel-Servicio-Inexistente', cacheMs: 0 });
  assert.equal(await control.status({ force: true }), 'not_installed');

  const result = await control.start();
  assert.equal(result.success, false);
  assert.equal(result.status, 'not_installed');
});
