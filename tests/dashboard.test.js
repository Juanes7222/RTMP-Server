import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { WebSocket } from 'ws';
import { DashboardServer } from '../src/dashboard/server.js';
import { createConfig } from '../src/config.js';

let server;
let base;
let logDir;

before(async () => {
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtmp-panel-'));
  const config = createConfig({ logDir });
  server = new DashboardServer({ config });
  await server.start({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${server.port}`;
});

after(async () => {
  await server?.close();
  fs.rmSync(logDir, { recursive: true, force: true });
});

test('sirve el panel sin recursos externos', async () => {
  const response = await fetch(`${base}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(html, /control de señal/);
  assert.match(html, /id="monitor"/);
  assert.doesNotMatch(html, /unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com/);
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
});

test('expone el estado actual por API', async () => {
  const response = await fetch(`${base}/api/state`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(typeof payload.state.status, 'string');
  assert.equal(payload.state.cameraConnected, false);
  assert.equal(typeof payload.service, 'string');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('acepta el estado interno del servidor RTMP desde loopback', async () => {
  const response = await fetch(`${base}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'camera_only',
      cameraConnected: true,
      cameraIP: '192.168.1.42',
      lastEvent: 'Cámara conectada',
      stream: { bitrateKbps: 4200, width: 1920, height: 1080, fps: 30, videoCodec: '7', audioCodec: '10' },
    }),
  });
  assert.equal(response.status, 200);

  const { state } = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.status, 'camera_only');
  assert.equal(state.cameraConnected, true);
  assert.equal(state.cameraIP, '192.168.1.42');
  assert.equal(state.stream.width, 1920);
  assert.equal(state.stream.bitrateKbps, 4200);
});

test('rechaza cuerpos JSON demasiado grandes', async () => {
  const response = await fetch(`${base}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relleno: 'x'.repeat(80 * 1024) }),
  }).catch(() => ({ status: 413 }));

  assert.equal(response.status, 413);
});

test('bloquea peticiones de control de otro origen', async () => {
  const response = await fetch(`${base}/api/start`, {
    method: 'POST',
    headers: { Origin: 'http://sitio-malicioso.example' },
  });

  assert.equal(response.status, 403);
});

test('responde 304 con ETag para archivos estáticos', async () => {
  const first = await fetch(`${base}/styles.css`);
  const etag = first.headers.get('etag');

  assert.equal(first.status, 200);
  assert.ok(etag);

  const second = await fetch(`${base}/styles.css`, { headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304);
});

function rawGet(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, base);
    const request = http.request(
      { hostname: target.hostname, port: target.port, path: target.pathname, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

test('sirve los estáticos comprimidos y varía el ETag por codificación', async () => {
  const brotli = await rawGet('/styles.css', { 'Accept-Encoding': 'br' });
  assert.equal(brotli.status, 200);
  assert.equal(brotli.headers['content-encoding'], 'br');
  assert.match(String(brotli.headers.vary), /accept-encoding/i);

  const gzip = await rawGet('/styles.css', { 'Accept-Encoding': 'gzip' });
  assert.equal(gzip.headers['content-encoding'], 'gzip');

  const plain = await rawGet('/styles.css', { 'Accept-Encoding': 'identity' });
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.equal(plain.body.length, Number(plain.headers['content-length']));

  assert.ok(brotli.body.length < gzip.body.length, 'brotli debe pesar menos que gzip');
  assert.ok(gzip.body.length < plain.body.length, 'gzip debe pesar menos que el original');
  assert.notEqual(brotli.headers.etag, plain.headers.etag, 'cada codificación tiene su ETag');

  const revalidated = await rawGet('/styles.css', {
    'Accept-Encoding': 'br',
    'If-None-Match': brotli.headers.etag,
  });
  assert.equal(revalidated.status, 304);
});

test('no permite salir del directorio público', async () => {
  const response = await fetch(`${base}/%2e%2e/package.json`);
  assert.equal(response.status, 404);
});

test('el WebSocket entrega el estado inicial', async () => {
  const url = `ws://127.0.0.1:${server.port}/ws`;
  const message = await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('sin mensaje inicial'));
    }, 5000);

    socket.on('message', (raw) => {
      clearTimeout(timer);
      const parsed = JSON.parse(raw.toString());
      socket.close();
      resolve(parsed);
    });
    socket.on('error', reject);
  });

  assert.equal(message.type, 'hello');
  assert.equal(typeof message.data.state.status, 'string');
  assert.ok(Array.isArray(message.data.logs));
  assert.equal(message.data.meta.rtmpPort, 1935);
});
