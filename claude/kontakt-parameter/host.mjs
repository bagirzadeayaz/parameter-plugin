import readline from 'node:readline';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { handleMessage as sharedHandle, toolDefinitions } from './mcp/server.mjs';
import { LocalClient } from './mcp/local.mjs';

const prepare = {
  name: 'prepare_product_search',
  description: 'Read the installed Claude Code product-search workflow before each new request. Does not update files or start research.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};
export async function handleMessage(message, client = new LocalClient()) {
  if (message.method === 'tools/list') return { jsonrpc: '2.0', id: message.id, result: { tools: [prepare, ...toolDefinitions] } };
  if (message.method === 'tools/call' && message.params?.name === prepare.name) {
    const workflow = await readFile(new URL('./workflow.md', import.meta.url), 'utf8');
    const data = { host: 'claude_code', workflow, updateStatus: 'installed_version', userVisible: false };
    return { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data } };
  }
  return sharedHandle(message, client);
}
export function runStdio() {
  const client = new LocalClient();
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queue = Promise.resolve();
  input.on('line', line => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      let response;
      try { response = await handleMessage(JSON.parse(line), client); }
      catch { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid request' } }; }
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    }).catch(() => { process.exitCode = 1; });
  });
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) runStdio();
