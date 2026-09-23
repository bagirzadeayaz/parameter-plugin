import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FirebaseClient } from './firebase.mjs';
import { lookupAccount, readPublicConfig, saveSession, setAccountDisplayName } from './auth.mjs';
import { createPendingProfile } from './registration.mjs';

const AUTH_TTL_MS = 5 * 60 * 1000;
let activeFlow = null;

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error('Request is too large.');
  }
  return JSON.parse(raw || '{}');
}

export function renderAuthPage(template, config, state, nonce) {
  const publicConfig = JSON.stringify({ apiKey: config.apiKey }).replace(/</g, '\\u003c');
  return template.replaceAll('__NONCE__', nonce).replace('__CONFIG__', publicConfig).replace('__STATE__', JSON.stringify(state));
}

export function openBrowser(url, platform = process.platform, spawnImpl = spawn) {
  let command; let args;
  if (platform === 'win32') { command = 'cmd'; args = ['/c', 'start', '', url]; }
  else if (platform === 'darwin') { command = 'open'; args = [url]; }
  else { command = 'xdg-open'; args = [url]; }
  const child = spawnImpl(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref?.();
}

export async function startBrowserAuth({ launch = true, timeoutMs = AUTH_TTL_MS, fetchImpl = fetch } = {}) {
  if (activeFlow) {
    activeFlow.close('A newer sign-in request replaced this one.');
    activeFlow = null;
  }
  const config = await readPublicConfig();
  const template = await readFile(fileURLToPath(new URL('../assets/auth.html', import.meta.url)), 'utf8');
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(18).toString('base64url');
  const startedAt = Date.now();
  let finish;
  const completion = new Promise(resolve => { finish = resolve; });

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method === 'GET' && requestUrl.pathname === '/') {
      if (requestUrl.searchParams.get('state') !== state) return json(response, 403, { ok: false, message: 'Invalid sign-in request.' });
      const page = renderAuthPage(template, config, state, nonce);
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer', 'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self' https://identitytoolkit.googleapis.com; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
      });
      return response.end(page);
    }
    if (request.method === 'POST' && requestUrl.pathname === '/complete') {
      try {
        const body = await readJson(request);
        if (body.state !== state || Date.now() - startedAt > timeoutMs) return json(response, 403, { ok: false, message: 'The sign-in request expired. Start it again.' });
        if (!['signin', 'register'].includes(body.mode)) return json(response, 400, { ok: false, message: 'Invalid account operation.' });
        if (!body.idToken || !body.refreshToken) return json(response, 400, { ok: false, message: 'Firebase session was not returned.' });
        const account = await lookupAccount(config, body.idToken, fetchImpl);
        if (account.localId !== body.localId || String(account.email || '').toLowerCase() !== String(body.email || '').toLowerCase()) return json(response, 403, { ok: false, message: 'Account verification failed.' });
        const auth = { idToken: body.idToken, refreshToken: body.refreshToken, localId: account.localId, email: account.email };
        if (body.mode === 'register') {
          const displayName = String(body.displayName || '').trim();
          if (!displayName) return json(response, 400, { ok: false, message: 'Full name is required.' });
          await setAccountDisplayName(config, body.idToken, displayName, fetchImpl);
          await createPendingProfile(config, auth, displayName, fetchImpl);
        }
        const session = { refreshToken: body.refreshToken, uid: account.localId, email: account.email, ...config };
        const client = new FirebaseClient({ sessionLoader: async () => session });
        const user = await client.getDocument('users', session.uid);
        await saveSession(session);
        const result = { ok: true, email: session.email, role: user.role, pending: user.role === 'pending' };
        json(response, 200, result);
        finish(result);
        setTimeout(() => { server.close(); if (activeFlow?.state === state) activeFlow = null; }, 750).unref?.();
      } catch (error) {
        json(response, 400, { ok: false, message: String(error?.message || 'Account setup failed.').slice(0, 500) });
      }
      return;
    }
    json(response, 404, { ok: false, message: 'Not found.' });
  });

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/?state=${encodeURIComponent(state)}`;
  const expiresAt = new Date(startedAt + timeoutMs).toISOString();
  const timer = setTimeout(() => {
    server.close(); finish({ ok: false, expired: true }); if (activeFlow?.state === state) activeFlow = null;
  }, timeoutMs);
  timer.unref?.();
  const close = message => { clearTimeout(timer); server.close(); finish({ ok: false, cancelled: true, message }); };
  activeFlow = { state, url, expiresAt, completion, close };
  if (launch) {
    try { openBrowser(url); } catch { /* The returned URL remains usable. */ }
  }
  return { state, url, expiresAt, completion, close };
}
