import readline from 'node:readline';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RuntimeUpdater, runRuntime, atomicJson, profileRoot } from './updater.mjs';

export class Bootstrap {
  constructor({ updater = new RuntimeUpdater(), runner = runRuntime, pins = join(profileRoot(), 'runtime-pins') } = {}) {
    Object.assign(this, { updater, runner, pins });
  }
  async initialize() {
    const base = await this.updater.initialize();
    this.tools = [{
      name: 'prepare_product_search',
      description: 'Call before EVERY new product request, before any Web Search, variant choices or schema calls. Automatically select a compatible plugin update and return the current research workflow and runtime_id. For an existing task, pass task_id to retrieve its pinned workflow without updating. Normal update checks are internal; continue directly with the product request.',
      inputSchema: { type: 'object', properties: { task_id: { type: 'string', minLength: 1, maxLength: 128 } }, additionalProperties: false },
    }, ...base.tools.map(tool => ({ ...tool, inputSchema: {
      ...tool.inputSchema,
      properties: { ...tool.inputSchema.properties, runtime_id: { type: 'string', description: 'Version returned by prepare_product_search. Required before task creation and for reruns; existing task calls use their saved version.' } },
    } }))];
  }
  pinPath(id) {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(id || '')) throw new Error('Invalid task ID');
    return join(this.pins, `${id}.json`);
  }
  async taskRuntime(id) {
    let pin;
    try { pin = JSON.parse(await readFile(this.pinPath(id), 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return this.updater.lastWorking();
    }
    return this.updater.cached(pin.runtimeId);
  }
  async handle(message) {
    if (message.method === 'initialize') return { jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion || '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'kontakt-parameter', version: 'updater-1' } } };
    if (message.method === 'tools/list') return { jsonrpc: '2.0', id: message.id, result: { tools: this.tools } };
    if (message.method === 'ping') return { jsonrpc: '2.0', id: message.id, result: {} };
    if (message.id === undefined) return null;
    if (message.method !== 'tools/call') return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
    try {
      const name = message.params?.name;
      const { runtime_id, ...args } = message.params?.arguments || {};
      if (!this.tools.some(tool => tool.name === name)) throw new Error('Unknown plugin tool');
      if (name === 'prepare_product_search') {
        const runtime = args.task_id ? await this.taskRuntime(args.task_id) : await this.updater.check();
        const data = { runtime_id: runtime.id, workflow: runtime.workflow, updateStatus: runtime.updateStatus || 'pinned', userVisible: false };
        return { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data } };
      }
      let runtime;
      if (name === 'rerun_product_search' || !args.task_id) {
        if (runtime_id) runtime = await this.updater.cached(runtime_id);
        else if (['parameter_connection_status', 'list_product_searches'].includes(name)) runtime = await this.updater.lastWorking();
        else throw new Error('Call prepare_product_search first and pass its runtime_id.');
      } else {
        runtime = await this.taskRuntime(args.task_id);
        if (runtime_id && runtime_id !== runtime.id) throw new Error('Use this task’s pinned runtime; do not switch versions during a search.');
      }
      const response = await this.runner(runtime.root, { ...message, params: { name, arguments: args } });
      const taskId = response?.result?.structuredContent?.taskId;
      if (taskId && !response.result.isError && ['start_product_search', 'rerun_product_search'].includes(name)) {
        await atomicJson(this.pinPath(taskId), { runtimeId: runtime.id });
      }
      return response;
    } catch (error) {
      const data = { error: { code: 'runtime_error', message: String(error.message).slice(0, 300) }, userVisible: false };
      return { jsonrpc: '2.0', id: message.id, result: { isError: true, structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] } };
    }
  }
}

export async function runStdio() {
  const bootstrap = new Bootstrap();
  await bootstrap.initialize();
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queue = Promise.resolve();
  input.on('line', line => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      let response;
      try { response = await bootstrap.handle(JSON.parse(line)); }
      catch { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid request' } }; }
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    });
  });
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await runStdio();
