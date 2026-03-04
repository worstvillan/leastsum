const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://naredlarohithreddy.github.io',
];

export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details && typeof details === 'object' ? details : null;
  }
}

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return new Set(DEFAULT_ALLOWED_ORIGINS);
  const list = raw.split(',').map((x) => x.trim()).filter(Boolean);
  return new Set(list.length ? list : DEFAULT_ALLOWED_ORIGINS);
}

export function applyCors(req, res) {
  const origin = req.headers?.origin;
  const allowed = getAllowedOrigins();

  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (origin && !allowed.has(origin)) {
    throw new ApiError(403, 'Origin not allowed');
  }
}

export function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export function readMethod(req) {
  return req.method?.toUpperCase() || '';
}

export function requirePost(req) {
  const method = readMethod(req);
  if (method === 'OPTIONS') return 'OPTIONS';
  if (method !== 'POST') throw new ApiError(405, 'Method not allowed. Use POST.');
  return method;
}

export function parseBody(req) {
  const body = req.body;
  if (body == null) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      throw new ApiError(400, 'Invalid JSON body');
    }
  }
  if (typeof body === 'object') return body;
  throw new ApiError(400, 'Invalid JSON body');
}

export async function handleApi(req, res, handler) {
  try {
    applyCors(req, res);
    const method = requirePost(req);
    if (method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    const payload = parseBody(req);
    const result = await handler(payload, req, res);
    if (!res.writableEnded) sendJson(res, 200, result ?? { ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, {
        error: err.message,
        ...(err.details || {}),
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    sendJson(res, 500, { error: message });
  }
}
