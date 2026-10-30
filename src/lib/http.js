import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Solo se comprimen textos: imágenes y fuentes ya vienen comprimidas.
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml']);
const MIN_COMPRESS_BYTES = 1024;

/**
 * Elige la codificación según `Accept-Encoding`. En empate gana la primera de
 * `available` (brotli), y `identity` solo si nada comprimido es aceptable.
 */
export function chooseEncoding(acceptEncoding, available = ['br', 'gzip']) {
  if (!acceptEncoding) return 'identity';

  const entries = new Map();
  for (const part of String(acceptEncoding).split(',')) {
    const [rawName, ...params] = part.trim().split(';');
    const name = rawName.trim().toLowerCase();
    if (!name) continue;

    let quality = 1;
    for (const param of params) {
      const [key, value] = param.trim().split('=');
      if (key?.trim().toLowerCase() !== 'q') continue;
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) quality = Math.min(1, Math.max(0, parsed));
    }

    entries.set(name, quality);
  }

  if (entries.size === 0) return 'identity';

  const wildcard = entries.get('*');
  let best = null;
  let bestQuality = 0;

  for (const encoding of available) {
    const quality = entries.get(encoding) ?? wildcard ?? 0;
    if (quality > bestQuality) {
      best = encoding;
      bestQuality = quality;
    }
  }

  const identityQuality = entries.get('identity');
  if (identityQuality !== undefined && identityQuality > bestQuality) return 'identity';

  return bestQuality > 0 ? best : 'identity';
}

/** Variantes comprimidas de un activo (una sola vez por versión del archivo). */
function compressVariants(body) {
  const variants = {};

  try {
    variants.br = zlib.brotliCompressSync(body, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    });
  } catch {
    // Sin brotli se sigue sirviendo gzip o el original.
  }

  try {
    variants.gzip = zlib.gzipSync(body, { level: 9 });
  } catch {
    // Ídem.
  }

  return variants;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Lee un cuerpo JSON con límite estricto de tamaño (evita agotar memoria). */
export function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;

      if (size > limit) {
        settled = true;
        reject(new HttpError(413, 'Cuerpo de la petición demasiado grande'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (size === 0) return resolve({});

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON inválido'));
      }
    });

    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

export function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function isLoopback(req) {
  const address = req.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address.startsWith('::ffff:127.');
}

/**
 * Protección básica contra CSRF: un POST de navegador debe venir del mismo
 * origen. Las peticiones sin Origin (servidor RTMP, scripts locales) solo se
 * aceptan desde loopback.
 */
export function isTrustedPost(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;

  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  return isLoopback(req);
}

/**
 * Sirve archivos estáticos desde memoria con validación por mtime.
 * Cada activo se guarda también comprimido (brotli y gzip), así el panel viaja
 * un 75–80 % más pequeño sin coste de CPU por petición.
 */
export function createStaticHandler({ dir }) {
  const cache = new Map();

  return async function serveStatic(req, res, urlPath) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return false;
    }

    const relative = decoded === '/' ? '/index.html' : decoded;
    const filePath = path.resolve(dir, `.${relative}`);
    if (filePath !== dir && !filePath.startsWith(`${dir}${path.sep}`)) return false;

    let stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch {
      return false;
    }
    if (!stats.isFile()) return false;

    let asset = cache.get(filePath);
    if (!asset || asset.mtimeMs !== stats.mtimeMs) {
      const body = await fs.promises.readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();
      const mtime = Math.round(stats.mtimeMs);

      const variants = new Map([['identity', body]]);
      if (COMPRESSIBLE.has(extension) && body.length >= MIN_COMPRESS_BYTES) {
        for (const [name, compressed] of Object.entries(compressVariants(body))) {
          variants.set(name, compressed);
        }
      }

      const encoded = new Map();
      for (const [name, buffer] of variants) {
        const suffix = name === 'identity' ? '' : `-${name}`;
        encoded.set(name, { body: buffer, etag: `W/"${buffer.length}-${mtime}${suffix}"` });
      }

      asset = {
        mtimeMs: stats.mtimeMs,
        type: MIME_TYPES[extension] ?? 'application/octet-stream',
        variants: encoded,
      };
      cache.set(filePath, asset);
    }

    const available = [...asset.variants.keys()].filter((name) => name !== 'identity');
    const encoding = chooseEncoding(req.headers['accept-encoding'], available);
    const variant = asset.variants.get(encoding) ?? asset.variants.get('identity');

    const headers = {
      'Content-Type': asset.type,
      'Cache-Control': 'no-cache',
      Vary: 'Accept-Encoding',
      ETag: variant.etag,
    };
    if (encoding !== 'identity' && asset.variants.has(encoding)) {
      headers['Content-Encoding'] = encoding;
    }

    if (req.headers['if-none-match'] === variant.etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }

    res.writeHead(200, { ...headers, 'Content-Length': variant.body.length });
    res.end(req.method === 'HEAD' ? undefined : variant.body);
    return true;
  };
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none'",
};
