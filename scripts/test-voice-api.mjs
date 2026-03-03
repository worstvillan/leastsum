#!/usr/bin/env node

const rawBase = process.argv[2] || process.env.TOKEN_API_BASE || 'http://localhost:3001/get-token';
const origin = process.env.TEST_ORIGIN || 'http://localhost:5173';

function resolveEndpoint(base) {
  const normalized = base.replace(/\/+$/, '');
  if (normalized.endsWith('/api/get-token') || normalized.endsWith('/get-token')) return normalized;
  return `${normalized}/api/get-token`;
}

const endpoint = resolveEndpoint(rawBase);

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function request(method, body, reqOrigin = origin) {
  const headers = { 'Content-Type': 'application/json' };
  if (reqOrigin) headers.Origin = reqOrigin;

  let res;
  try {
    res = await fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown fetch error';
    throw new Error(`request failed (${method} ${endpoint}): ${msg}`);
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: res.status, body: json, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log(`Testing token endpoint: ${endpoint}`);
  let failures = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL: ${name}`);
      console.error(`  ${error.message}`);
    }
  }

  await test('POST valid payload returns 200 with token/url/expiresIn', async () => {
    const payload = { roomName: 'ABCD', participantName: 'Rohith', participantId: 'p1' };
    const res = await request('POST', payload);
    assert(res.status === 200, `expected 200, got ${res.status} body=${res.text}`);
    assert(res.body && typeof res.body.token === 'string', 'missing token in response');
    assert(typeof res.body.url === 'string' && res.body.url.length > 0, 'missing url in response');
    assert(Number.isFinite(res.body.expiresIn), 'missing expiresIn in response');

    const jwt = decodeJwtPayload(res.body.token);
    assert(jwt, 'unable to decode JWT payload');
    assert(jwt.sub === 'ABCD:p1', `expected sub=ABCD:p1, got ${jwt?.sub}`);
    assert(jwt.video?.room === 'ABCD', `expected video.room=ABCD, got ${jwt?.video?.room}`);
    assert(jwt.video?.canPublish === true, 'expected video.canPublish=true');
    assert(jwt.video?.canSubscribe === true, 'expected video.canSubscribe=true');
  });

  await test('POST missing roomName returns 400', async () => {
    const res = await request('POST', { participantName: 'Rohith' });
    assert(res.status === 400, `expected 400, got ${res.status} body=${res.text}`);
  });

  await test('POST missing participantName returns 400', async () => {
    const res = await request('POST', { roomName: 'ABCD' });
    assert(res.status === 400, `expected 400, got ${res.status} body=${res.text}`);
  });

  await test('GET returns 405', async () => {
    const res = await request('GET');
    assert(res.status === 405, `expected 405, got ${res.status} body=${res.text}`);
  });

  await test('Disallowed origin returns 403', async () => {
    const res = await request('POST', { roomName: 'ABCD', participantName: 'Rohith' }, 'https://evil.example');
    assert(res.status === 403, `expected 403, got ${res.status} body=${res.text}`);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }

  console.log('\nAll tests passed.');
}

run().catch((error) => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});
