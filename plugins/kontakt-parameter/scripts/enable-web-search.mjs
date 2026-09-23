import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const codexHome = process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
if (!codexHome) throw new Error('Codex profile directory could not be determined.');
const configPath = join(codexHome, 'config.toml');
let text = '';
try { text = await readFile(configPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const newline = text.includes('\r\n') ? '\r\n' : '\n';
const lines = text ? text.replace(/\r\n/g, '\n').split('\n') : [];
const firstTable = lines.findIndex(line => /^\s*\[/.test(line));
const rootEnd = firstTable < 0 ? lines.length : firstTable;
const rootSetting = lines.slice(0, rootEnd).findIndex(line => /^\s*web_search\s*=/.test(line));
if (rootSetting >= 0) lines[rootSetting] = 'web_search = "live"';
else lines.splice(rootEnd, 0, 'web_search = "live"', '');

await mkdir(dirname(configPath), { recursive: true });
await writeFile(configPath, `${lines.join(newline).replace(/(?:\r?\n)*$/, '')}${newline}`, 'utf8');
process.stdout.write(`Enabled live Codex web search in ${configPath}${newline}`);
