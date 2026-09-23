import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const APPROVED_ROLES = new Set(['super_admin', 'coordinator', 'department_head', 'user', 'brand_manager', 'parameter_admin']);
let tokenCache = null;

export function sessionPath(env = process.env) {
  const profile = env.CODEX_HOME || join(env.USERPROFILE || env.HOME || homedir(), '.codex');
  return join(profile, 'kontakt-parameter', 'session.json');
}
export async function loadSession(path = sessionPath()) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`Cannot read Kontakt session: ${error.message}`); }
}
export async function saveSession(session, path = sessionPath()) {
  const safe = { refreshToken: String(session.refreshToken || ''), uid: String(session.uid || ''), email: String(session.email || ''), projectId: String(session.projectId || ''), region: String(session.region || 'us-central1'), apiKey: String(session.apiKey || '') };
  if (!safe.refreshToken || !safe.projectId || !safe.apiKey) throw new Error('Incomplete Firebase session.');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(safe, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  return path;
}
export async function removeSession(path = sessionPath()) { tokenCache = null; await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
export async function readPublicConfig(start = process.cwd()) {
  let dir = resolve(start);
  for (let i = 0; i < 8; i += 1) {
    for (const name of ['.env', '.env.local']) {
      try {
        const text = await readFile(join(dir, name), 'utf8');
        const values = Object.fromEntries(text.split(/\r?\n/).map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g, '')]));
        if (values.VITE_FIREBASE_API_KEY && values.VITE_FIREBASE_PROJECT_ID) return { apiKey: values.VITE_FIREBASE_API_KEY, projectId: values.VITE_FIREBASE_PROJECT_ID, region: values.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1' };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const parent = dirname(dir); if (parent === dir) break; dir = parent;
  }
  try {
    const bundled = JSON.parse(await readFile(fileURLToPath(new URL('../firebase.public.json', import.meta.url)), 'utf8'));
    if (bundled.apiKey && bundled.projectId) return { apiKey: bundled.apiKey, projectId: bundled.projectId, region: bundled.region || 'us-central1' };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  throw new Error('Kontakt connection settings were not found. Reinstall the plugin package.');
}
async function jsonRequest(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, options); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || body?.error?.status || `HTTP ${response.status}`); return body;
}
export async function signInWithPassword(config, email, password, fetchImpl = fetch) {
  return jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) }, fetchImpl);
}
export async function createAccountWithPassword(config, email, password, fetchImpl = fetch) {
  return jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) }, fetchImpl);
}
export async function setAccountDisplayName(config, idToken, displayName, fetchImpl = fetch) {
  return jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken, displayName, returnSecureToken: false }) }, fetchImpl);
}
export async function lookupAccount(config, idToken, fetchImpl = fetch) {
  const body = await jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) }, fetchImpl);
  const user = body?.users?.[0];
  if (!user?.localId) throw new Error('Firebase did not return a valid user account.');
  return user;
}
export async function getIdToken(session, fetchImpl = fetch) {
  if (tokenCache?.token && tokenCache.expiresAt > Date.now() + 60_000 && tokenCache.uid === session.uid) return tokenCache.token;
  const body = await jsonRequest(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(session.apiKey)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }) }, fetchImpl);
  tokenCache = { token: body.id_token, uid: body.user_id || session.uid, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 }; return tokenCache.token;
}
export function redactError(error) { return String(error?.message || error || 'Unknown error').replace(/((?:refresh_token|id_token|password|api[_-]?key)\s*[=:]\s*)[^\s,}]+/gi, '$1[redacted]').slice(0, 800); }
