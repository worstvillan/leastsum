import crypto from 'crypto';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_DB_SCOPE = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/cloud-platform';

let cachedAccessToken = null;
let cachedAccessTokenExp = 0;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function readDatabaseUrl() {
  const raw =
    process.env.FIREBASE_DATABASE_URL ||
    process.env.VITE_FIREBASE_DATABASE_URL ||
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!raw) {
    throw new Error('Missing FIREBASE_DATABASE_URL');
  }
  return raw.replace(/\/+$/, '');
}

function base64UrlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseServiceAccountFromEnv() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    const privateKey = String(parsed.private_key || '').replace(/\\n/g, '\n');
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey,
    };
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error('Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_ADMIN_* envs.');
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
  };
}

async function requestAccessTokenWithAssertion(assertion) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data;
}

function buildServiceAccountAssertion(serviceAccount) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.clientEmail,
    sub: serviceAccount.clientEmail,
    aud: OAUTH_TOKEN_URL,
    scope: FIREBASE_DB_SCOPE,
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(serviceAccount.privateKey);

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

export async function getAdminAccessToken() {
  const nowMs = Date.now();
  if (cachedAccessToken && cachedAccessTokenExp > nowMs + 60_000) {
    return cachedAccessToken;
  }

  const serviceAccount = parseServiceAccountFromEnv();
  const assertion = buildServiceAccountAssertion(serviceAccount);
  const tokenResp = await requestAccessTokenWithAssertion(assertion);

  const accessToken = tokenResp.access_token;
  const expiresInSec = Number(tokenResp.expires_in || 3600);
  if (!accessToken) throw new Error('Missing access_token from OAuth response');

  cachedAccessToken = accessToken;
  cachedAccessTokenExp = nowMs + expiresInSec * 1000;
  return accessToken;
}

function buildDbUrl(path, query = {}) {
  const safePath = String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const base = readDatabaseUrl();
  const url = new URL(`${base}/${safePath}.json`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseJsonMaybe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function adminRequest({
  path,
  method = 'GET',
  data,
  query,
  wantEtag = false,
  ifMatch,
}) {
  const token = await getAdminAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (wantEtag) headers['X-Firebase-ETag'] = 'true';
  if (ifMatch) headers['if-match'] = ifMatch;

  let body;
  if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }

  const res = await fetch(buildDbUrl(path, query), { method, headers, body });
  const responseBody = await parseJsonMaybe(res);

  return {
    ok: res.ok,
    status: res.status,
    etag: res.headers.get('etag'),
    data: responseBody,
  };
}

export async function adminGet(path) {
  const resp = await adminRequest({ path, method: 'GET' });
  if (!resp.ok) {
    throw new Error(`RTDB GET failed (${resp.status}) at ${path}`);
  }
  return resp.data;
}

export async function adminSet(path, value) {
  const resp = await adminRequest({
    path,
    method: 'PUT',
    data: value,
    query: { print: 'silent' },
  });
  if (!resp.ok) {
    throw new Error(`RTDB PUT failed (${resp.status}) at ${path}`);
  }
}

export async function adminPatch(path, value) {
  const resp = await adminRequest({
    path,
    method: 'PATCH',
    data: value,
    query: { print: 'silent' },
  });
  if (!resp.ok) {
    throw new Error(`RTDB PATCH failed (${resp.status}) at ${path}`);
  }
}

export async function adminDelete(path) {
  const resp = await adminRequest({
    path,
    method: 'DELETE',
    query: { print: 'silent' },
  });
  if (!resp.ok) {
    throw new Error(`RTDB DELETE failed (${resp.status}) at ${path}`);
  }
}

export async function runAdminTransaction(path, mutator, maxRetries = 8) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const current = await adminRequest({ path, method: 'GET', wantEtag: true });
    if (!current.ok) {
      throw new Error(`RTDB transaction GET failed (${current.status}) at ${path}`);
    }

    const nextValue = await mutator(current.data);
    if (nextValue === undefined) {
      return { committed: false, value: current.data };
    }

    const put = await adminRequest({
      path,
      method: 'PUT',
      data: nextValue,
      ifMatch: current.etag || '*',
      query: { print: 'silent' },
    });

    if (put.ok) {
      return { committed: true, value: nextValue };
    }

    if (put.status !== 412) {
      throw new Error(`RTDB transaction PUT failed (${put.status}) at ${path}`);
    }
  }

  throw new Error(`RTDB transaction retry limit exceeded at ${path}`);
}

export function getFirebaseProjectId() {
  return (
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    parseServiceAccountFromEnv().projectId
  );
}

export function readRequiredEnv(name) {
  return requireEnv(name);
}
