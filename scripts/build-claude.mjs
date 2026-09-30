import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = fileURLToPath(new URL('../', import.meta.url));
const source = join(repo, 'plugins/kontakt-parameter');
const target = join(repo, 'claude/kontakt-parameter');
const check = process.argv.includes('--check');
// Explicit allowlist: never ship credentials, results, Codex config, or its updater.
export const files = ['mcp/bilingual-catalog.mjs', 'mcp/bilingual.mjs', 'mcp/evidence.mjs', 'mcp/image.mjs',
  'mcp/local.mjs', 'mcp/pdf.mjs', 'mcp/platform.mjs', 'mcp/presentation.mjs',
  'mcp/result.mjs', 'mcp/schema.mjs', 'mcp/server.mjs',
  'schemas.json', 'scripts/generate_product_pdf.py', 'workflow.md'];
function replaceOnce(text, from, to) {
  if (text.split(from).length !== 2) throw new Error(`Host adaptation requires review: ${from}`);
  return text.replace(from, to);
}
function replaceLine(text, prefix, replacement) {
  const lines = text.split('\n');
  const matches = lines.filter(line => line.startsWith(prefix));
  if (matches.length !== 1) throw new Error(`Workflow adaptation requires review: ${prefix}`);
  return text.replace(matches[0], replacement);
}
export function adapt(name, text) {
  if (name === 'mcp/local.mjs') {
    text = replaceOnce(text, "process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME || homedir(), '.codex')", "process.env.CLAUDE_CONFIG_DIR || join(process.env.USERPROFILE || process.env.HOME || homedir(), '.claude')");
    text = text.replaceAll("'codex_native'", "'claude_native'").replaceAll("'codex_builtin_web_search'", "'claude_code_web_search'").replaceAll('Real Codex Web Search', 'Real Claude Code WebSearch');
  }
  if (name === 'mcp/server.mjs') text = text.replaceAll('Codex native', 'Claude Code native').replaceAll('so Codex can', 'so Claude can');
  if (name === 'mcp/platform.mjs') text = replaceOnce(text, 'data: { action, capability:', "data: { researchProvider: 'claude_native', action, capability:");
  if (name === 'mcp/pdf.mjs') {
    text = replaceLine(text, "    join(profile, '.cache', 'codex-runtimes'", '');
    text = replaceOnce(text, '  const profile = process.env.USERPROFILE || homedir();\n', '');
  }
  if (name === 'workflow.md') {
    text = replaceLine(text, '1. This workflow is supplied by', '1. Call `prepare_product_search` before each new product request. It returns the workflow bundled with this Claude plugin version; no Codex runtime ID is needed. Keep this workflow through pending choices and the same search. Call `parameter_connection_status` if storage readiness is unknown. Never ask for a Kontakt sign-in. If storage fails, explain briefly in Azerbaijani.');
    text = replaceLine(text, '    - Use the native choice UI', '    - Use Claude Code `AskUserQuestion` for one variant dimension at a time. Wait for an actual customer answer; a default, timeout or acknowledgement is not a selection. If the UI cannot display every option, include the complete verified set in the question text and accept an exact typed answer. Never truncate the verified set.');
    text = replaceLine(text, '    - Keep the pending choice active', '    - Keep the pending question unanswered until the customer selects a variant. Do not start or save an ambiguous product. Never silently substitute a related product.');
    text = text.replaceAll('Codex', 'Claude Code').replaceAll('`web_search` event', '`WebSearch` call');
    text += '\n## Claude Code host contract\n\nUse built-in `WebSearch` for discovery and `WebFetch` to open sources. Request exact field-specific excerpts when fetching; do not claim to have read content that the fetch did not return. Count only real successful WebSearch calls after this search starts in nativeWebSearchEventCount. These legacy payload keys represent host-native research, not Codex usage. Never invent calls or evidence to pass validation. Use `inspect_product_image` and inspect the returned MCP image pixels; WebFetch text is not image analysis. If the host cannot expose pixels, report the limitation and do not fabricate observations.\n\nDiscover the plugin MCP tools with ToolSearch if deferred. Respect permission denials and unavailable tools. After repeated identical service failures with no safe corrective action, preserve the task and give a concise Azerbaijani failure; do not loop indefinitely.\n\nClaude terminal interfaces may not display inline images or downloadable cards. Include the verified image link and absolute PDF path; use a file-delivery tool only if available. Never claim an inline preview or upload happened without confirmation. Do not change saved parameter values or omit the full paired table because of presentation limitations.\n';
  }
  return text;
}
for (const name of files) {
  const original = await readFile(join(source, name), 'utf8');
  const expected = adapt(name, original.replaceAll('\r\n', '\n'));
  const output = join(target, name);
  if (check) {
    const actual = await readFile(output, 'utf8');
    if (actual.replaceAll('\r\n', '\n') !== expected) throw new Error(`Stale Claude bundle: ${name}`);
  } else {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, expected);
  }
}
console.log(check ? 'Claude bundle matches shared sources.' : 'Claude bundle built; Codex package untouched.');
