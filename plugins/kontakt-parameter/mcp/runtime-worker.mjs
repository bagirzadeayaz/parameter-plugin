import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// A fresh process avoids Node's module cache when a newer runtime is selected.
const root = resolve(process.argv[2]);
let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const engine = await import(pathToFileURL(join(root, 'mcp/server.mjs')).href);
let result;
if (request.probe) {
  const { getCategorySchema } = await import(pathToFileURL(join(root, 'mcp/schema.mjs')).href);
  for (const category of ['phone', 'tablet', 'notebook', 'fridge', 'washing_machine']) {
    if (!getCategorySchema(category).fields.length) throw new Error('Empty category schema');
  }
  const workflow = await readFile(join(root, 'workflow.md'), 'utf8');
  if (!workflow.trim()) throw new Error('Missing research workflow');
  const metadata = JSON.parse(await readFile(join(root, 'runtime.json'), 'utf8'));
  result = { abi: metadata.abi, tools: engine.toolDefinitions, workflow };
} else {
  const { LocalClient } = await import(pathToFileURL(join(root, 'mcp/local.mjs')).href);
  result = await engine.handleMessage(request, new LocalClient());
}
process.stdout.write(JSON.stringify(result));
