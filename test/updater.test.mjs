import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { RuntimeUpdater, bundledRoot, runRuntime, runtimeFile } from '../plugins/kontakt-parameter/mcp/updater.mjs';
import { Bootstrap } from '../plugins/kontakt-parameter/mcp/bootstrap.mjs';

const prefix = 'plugins/kontakt-parameter/';
const A = 'a'.repeat(40), B = 'b'.repeat(40);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kontakt-updater-test-'));
  const previousProfile = process.env.CODEX_HOME;
  process.env.CODEX_HOME = join(root, 'profile');
  t.after(async () => {
    if (previousProfile === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousProfile;
    await rm(root, { recursive: true, force: true });
  });
  const files = new Map();
  async function visit(relative = '') {
    for (const entry of await readdir(join(bundledRoot, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory() && (path === 'mcp' || path === 'scripts')) await visit(path);
      else if (entry.isFile() && runtimeFile(prefix + path)) files.set(path, await readFile(join(bundledRoot, path)));
    }
  }
  await visit();
  // Updater tests must never submit synthetic searches to the live platform.
  files.set('mcp/platform.mjs', Buffer.from(`
    export async function submitPlatform() {
      return { taskId: 'updater-fixture', stored: true, status: 'in_progress' };
    }
  `));
  const state = { head: A, offline: false, files, broken: null, calls: [] };
  const fetcher = async url => {
    state.calls.push(url);
    if (state.offline) throw new Error('Offline');
    if (url.endsWith('/commits/main')) return Response.json({ sha: state.head });
    if (url.includes('/git/trees/')) return Response.json({ tree: [...state.files].map(([path, bytes]) => ({
      path: prefix + path, mode: '100644', type: 'blob', size: bytes.length,
      sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    })) });
    const path = url.split(prefix)[1];
    return new Response(path === state.broken ? 'corrupt' : state.files.get(path), { status: state.files.has(path) ? 200 : 404 });
  };
  const updater = new RuntimeUpdater({ root: join(root, 'updates'), fetcher });
  return { root, state, updater, fetcher };
}

test('same launcher uses new code and instructions, while existing searches retain their version after restart', async t => {
  const { root, state, updater, fetcher } = await fixture(t);
  state.files.set('workflow.md', Buffer.from('Workflow A'));
  const pins = join(root, 'pins');
  const bootstrap = new Bootstrap({ updater, pins });
  await bootstrap.initialize();
  let id = 0;
  const call = (name, args = {}) => bootstrap.handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } });
  const a = (await call('prepare_product_search')).result.structuredContent;
  assert.equal(a.runtime_id, A);
  assert.equal(a.workflow, 'Workflow A');
  const started = await call('start_product_search', { runtime_id: A, product_name: 'Fixture', category: 'phone' });
  const taskId = started.result.structuredContent.taskId;
  assert.ok(taskId);
  state.head = B;
  state.files.set('workflow.md', Buffer.from('Workflow B'));
  const originalLocal = state.files.get('mcp/local.mjs').toString();
  const updatedLocal = originalLocal.replace(/storage: '[^']*'/, "storage: 'updated-engine'");
  assert.notEqual(updatedLocal, originalLocal, 'fixture must change the runtime storage marker');
  state.files.set('mcp/local.mjs', Buffer.from(updatedLocal));
  const b = (await call('prepare_product_search')).result.structuredContent;
  assert.equal(b.runtime_id, B);
  assert.equal(b.workflow, 'Workflow B');
  const status = await call('parameter_connection_status', { runtime_id: B });
  assert.equal(status.result.structuredContent.storage, 'updated-engine');
  const old = (await call('prepare_product_search', { task_id: taskId })).result.structuredContent;
  assert.equal(old.runtime_id, A);
  assert.equal(old.workflow, 'Workflow A');
  const mismatch = await call('get_product_search', { task_id: taskId, runtime_id: B });
  assert.equal(mismatch.result.isError, true);
  const next = new Bootstrap({ updater: new RuntimeUpdater({ root: updater.root, fetcher }), pins });
  await next.initialize();
  assert.equal((await next.taskRuntime(taskId)).id, A);
  state.offline = true;
  assert.equal((await updater.check()).id, B);
  assert.equal((await updater.check()).updateStatus, 'cached_fallback');
});

test('offline first run uses bundled workflow and requires preparation before starting', async t => {
  const { updater, state, root } = await fixture(t);
  state.offline = true;
  const bootstrap = new Bootstrap({ updater, pins: join(root, 'pins') });
  await bootstrap.initialize();
  const selected = await updater.check();
  assert.equal(selected.id, updater.bundleId);
  assert.match(selected.workflow, /Kontakt product search/);
  const response = await bootstrap.handle({ id: 1, method: 'tools/call', params: { name: 'start_product_search', arguments: { category: 'phone', product_name: 'Fixture' } } });
  assert.equal(response.result.isError, true);
});

for (const failure of ['corrupt download', 'incompatible ABI', 'changed tool interface', 'syntax error', 'missing workflow']) {
  test(`${failure} cannot replace the last working version`, async t => {
    const { updater, state } = await fixture(t);
    assert.equal((await updater.check()).id, A);
    state.head = B;
    if (failure === 'corrupt download') state.broken = 'mcp/server.mjs';
    if (failure === 'incompatible ABI') state.files.set('runtime.json', Buffer.from('{"abi":2}'));
    if (failure === 'changed tool interface') state.files.set('mcp/server.mjs', Buffer.from(state.files.get('mcp/server.mjs').toString().replace("name: 'parameter_connection_status'", "name: 'renamed_status'")));
    if (failure === 'syntax error') state.files.set('mcp/server.mjs', Buffer.from('invalid javascript {{{'));
    if (failure === 'missing workflow') state.files.delete('workflow.md');
    const result = await updater.check();
    assert.equal(result.id, A);
    assert.equal(result.updateStatus, 'cached_fallback');
    assert.equal((await readdir(join(updater.root, 'versions'))).some(name => name.startsWith('.download-')), false);
  });
}

test('damaged cached update falls back to the bundled version', async t => {
  const { updater, state } = await fixture(t);
  const selected = await updater.check();
  await writeFile(join(selected.root, 'workflow.md'), 'edited cache');
  state.offline = true;
  assert.equal((await updater.check()).id, updater.bundleId);
});

test('concurrent preparations share a check; independent processes can install the same revision', async t => {
  const { updater, state, fetcher } = await fixture(t);
  await updater.initialize();
  const results = await Promise.all([updater.check(), updater.check()]);
  assert.deepEqual(results.map(result => result.id), [A, A]);
  assert.equal(state.calls.filter(url => url.endsWith('/commits/main')).length, 1);
  state.head = B;
  const second = new RuntimeUpdater({ root: updater.root, fetcher });
  const concurrent = await Promise.all([updater.check(), second.check()]);
  assert.deepEqual(concurrent.map(result => result.id), [B, B]);
});

test('download paths cannot escape the runtime directory or include credentials', () => {
  for (const path of ['../evil.mjs', 'mcp/../../evil.mjs', 'mcp/C:/evil.mjs', '.env', 'firebase.public.json', 'mcp\\evil.mjs']) assert.equal(runtimeFile(prefix + path), null);
  assert.equal(runtimeFile(prefix + 'mcp/local.mjs'), 'mcp/local.mjs');
});

test('installed stdio entry point advertises the updater and existing tools', async t => {
  const { root } = await fixture(t);
  const child = spawn(process.execPath, [join(bundledRoot, 'mcp/bootstrap.mjs'), '--stdio'], {
    windowsHide: true, env: { ...process.env, CODEX_HOME: join(root, 'stdio-profile') }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.resume();
  const code = new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
  const timeout = setTimeout(() => child.kill(), 12000);
  t.after(() => { clearTimeout(timeout); child.kill(); });
  child.stdin.end([
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), '',
  ].join('\n'));
  assert.equal(await code, 0);
  const messages = output.trim().split('\n').map(JSON.parse);
  assert.equal(messages[0].result.serverInfo.name, 'kontakt-parameter');
  assert.ok(messages[1].result.tools.some(tool => tool.name === 'prepare_product_search'));
  assert.ok(messages[1].result.tools.find(tool => tool.name === 'start_product_search').inputSchema.properties.runtime_id);
});
