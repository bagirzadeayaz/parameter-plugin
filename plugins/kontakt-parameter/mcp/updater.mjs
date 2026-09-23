import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY = 'bagirzadeayaz/parameter-plugin';
const PREFIX = 'plugins/kontakt-parameter/';
const SHA = /^[a-f0-9]{40}$/;
const MAX_FILE = 8 * 1024 * 1024;
const WORKER = fileURLToPath(new URL('./runtime-worker.mjs', import.meta.url));
export const bundledRoot = fileURLToPath(new URL('../', import.meta.url));
export const profileRoot = () => join(process.env.CODEX_HOME || join(process.env.USERPROFILE || homedir(), '.codex'), 'kontakt-parameter');
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function runRuntime(root, request, timeout = 145000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, root], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Runtime timed out')); }, timeout);
    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 32 * 1024 * 1024) { child.kill(); finish(new Error('Runtime response too large')); }
    });
    child.stderr.resume();
    child.on('close', code => {
      if (code !== 0) return finish(new Error('Runtime failed to start or complete'));
      try { finish(null, JSON.parse(output)); } catch { finish(new Error('Invalid runtime response')); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, JSON.stringify(value)); await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}
async function jsonFile(path) { return JSON.parse(await readFile(path, 'utf8')); }

export function runtimeFile(path) {
  if (!path.startsWith(PREFIX)) return null;
  const relative = path.slice(PREFIX.length);
  if (relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) return null;
  if (['runtime.json', 'workflow.md', 'schemas.json', 'package.json'].includes(relative)) return relative;
  if (/^mcp\/[a-zA-Z0-9_./-]+\.mjs$/.test(relative)) return relative;
  if (relative === 'scripts/generate_product_pdf.py') return relative;
  return null;
}

export class RuntimeUpdater {
  constructor({ root = join(profileRoot(), 'updates'), bundle = bundledRoot, fetcher = fetch, runner = runRuntime } = {}) {
    Object.assign(this, { root, bundle, fetcher, runner });
  }
  async initialize() {
    if (!this.initializing) this.initializing = this.initializeBundle();
    return this.initializing;
  }
  async initializeBundle() {
    this.base = await this.runner(this.bundle, { probe: true }, 10000);
    this.contract = digest(this.base.tools);
    const files = [];
    const visit = async relative => {
      for (const entry of await readdir(join(this.bundle, relative), { withFileTypes: true })) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory() && ['mcp', 'scripts'].includes(path)) await visit(path);
        else if (entry.isDirectory() && path.startsWith('mcp/')) await visit(path);
        else if (entry.isFile() && runtimeFile(PREFIX + path)) {
          const bytes = await readFile(join(this.bundle, path));
          files.push({ path, bytes, hash: createHash('sha256').update(bytes).digest('hex') });
        }
      }
    };
    await visit('');
    files.sort((a, b) => a.path.localeCompare(b.path));
    this.bundleId = createHash('sha1').update(JSON.stringify(files.map(({ path, hash }) => ({ path, hash })))).digest('hex');
    const finalRoot = join(this.root, 'versions', this.bundleId);
    try { await this.cached(this.bundleId); }
    catch {
      await mkdir(join(this.root, 'versions'), { recursive: true });
      const stage = await mkdtemp(join(this.root, 'versions', '.bundle-'));
      try {
        for (const file of files) {
          await mkdir(dirname(join(stage, file.path)), { recursive: true });
          await writeFile(join(stage, file.path), file.bytes);
        }
        await atomicJson(join(stage, '.verified.json'), { id: this.bundleId, contract: this.contract, files: files.map(({ path, hash }) => ({ path, hash })) });
        try { await rename(stage, finalRoot); }
        catch (error) { try { await this.cached(this.bundleId); } catch { throw error; } }
      } finally { await rm(stage, { recursive: true, force: true }); }
    }
    return this.base;
  }
  async readBytes(url, signal) {
    const response = await this.fetcher(url, { signal, redirect: 'error', headers: { 'User-Agent': 'Kontakt-Parameter-Updater', Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`Update HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_FILE) throw new Error('Update file too large');
    const parts = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_FILE) throw new Error('Update file too large');
      parts.push(Buffer.from(chunk));
    }
    return Buffer.concat(parts);
  }
  async probe(root) {
    const result = await this.runner(root, { probe: true }, 10000);
    if (result.abi !== this.base.abi || digest(result.tools) !== this.contract) throw new Error('Update requires a plugin reinstall');
    return result;
  }
  async cached(id) {
    if (!SHA.test(id || '')) throw new Error('Invalid runtime identifier');
    const root = join(this.root, 'versions', id);
    const marker = await jsonFile(join(root, '.verified.json'));
    if (marker.id !== id || marker.contract !== this.contract) throw new Error('Incompatible saved runtime');
    // Also detect damaged or edited caches before executing their code.
    for (const file of marker.files) {
      if (!runtimeFile(PREFIX + file.path)) throw new Error('Invalid cached file');
      const bytes = await readFile(join(root, file.path));
      if (createHash('sha256').update(bytes).digest('hex') !== file.hash) throw new Error('Damaged cached runtime');
    }
    const probe = await this.probe(root);
    return { id, root, workflow: probe.workflow };
  }
  async lastWorking() {
    try { return await this.cached((await jsonFile(join(this.root, `active-${this.contract}.json`))).id); }
    catch { return this.cached(this.bundleId); }
  }
  async check() {
    await this.initialize();
    // Calls from one server share only the check; separate searches keep their own version.
    if (!this.pending) this.pending = this.refresh().finally(() => { this.pending = null; });
    return this.pending;
  }
  async refresh() {
    const fallback = await this.lastWorking();
    let stage;
    const signal = AbortSignal.timeout(20000);
    try {
      const head = JSON.parse(await this.readBytes(`https://api.github.com/repos/${REPOSITORY}/commits/main`, signal));
      const id = head.sha;
      if (!SHA.test(id || '')) throw new Error('Invalid remote revision');
      let runtime;
      try { runtime = await this.cached(id); } catch { /* Fetch a complete immutable version. */ }
      if (!runtime) {
        const tree = JSON.parse(await this.readBytes(`https://api.github.com/repos/${REPOSITORY}/git/trees/${id}?recursive=1`, signal));
        if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Incomplete repository tree');
        const files = tree.tree.map(file => ({ ...file, relative: runtimeFile(file.path) })).filter(file => file.relative);
        if (files.length > 100 || files.some(file => file.type !== 'blob' || file.mode !== '100644' || !SHA.test(file.sha) || file.size > MAX_FILE)) throw new Error('Invalid runtime files');
        for (const required of ['runtime.json', 'workflow.md', 'schemas.json', 'mcp/server.mjs', 'mcp/local.mjs']) {
          if (!files.some(file => file.relative === required)) throw new Error('Runtime is incomplete');
        }
        await mkdir(join(this.root, 'versions'), { recursive: true });
        stage = await mkdtemp(join(this.root, 'versions', '.download-'));
        const verified = [];
        // Bounded concurrency avoids a request burst and waits for all writers before cleanup.
        for (let i = 0; i < files.length; i += 4) {
          const outcomes = await Promise.allSettled(files.slice(i, i + 4).map(async file => {
            const bytes = await this.readBytes(`https://raw.githubusercontent.com/${REPOSITORY}/${id}/${file.path}`, signal);
            const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
            if (hash !== file.sha) throw new Error('Update integrity check failed');
            await mkdir(dirname(join(stage, file.relative)), { recursive: true });
            await writeFile(join(stage, file.relative), bytes);
            verified.push({ path: file.relative, hash: createHash('sha256').update(bytes).digest('hex') });
          }));
          const failed = outcomes.find(result => result.status === 'rejected');
          if (failed) throw failed.reason;
        }
        // Reject ABI changes before executing a candidate probe.
        if ((await jsonFile(join(stage, 'runtime.json'))).abi !== this.base.abi) throw new Error('Update requires a plugin reinstall');
        await this.probe(stage);
        await atomicJson(join(stage, '.verified.json'), { id, contract: this.contract, files: verified });
        const finalRoot = join(this.root, 'versions', id);
        try { await rename(stage, finalRoot); stage = null; }
        catch (error) {
          // Another Codex task may have finished this same revision first.
          try { await this.cached(id); } catch { throw error; }
        }
        runtime = await this.cached(id);
      }
      await atomicJson(join(this.root, `active-${this.contract}.json`), { id });
      return { ...runtime, updateStatus: id === fallback.id ? 'current' : 'updated' };
    } catch {
      return { ...fallback, updateStatus: 'cached_fallback' };
    } finally {
      if (stage) await rm(stage, { recursive: true, force: true });
    }
  }
}
