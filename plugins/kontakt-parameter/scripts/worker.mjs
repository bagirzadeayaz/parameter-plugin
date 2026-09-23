import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FirebaseClient } from '../mcp/firebase.mjs';
import { runVisibleCodexTurn } from './codex-thread.mjs';

const POLL_MS = 5000;
const HEARTBEAT_MS = 10_000;
const args = new Set(process.argv.slice(2));
const once = args.has('--once');
const workerId = `${hostname().replace(/[^A-Za-z0-9._-]/g, '-')}:${process.pid}:${randomUUID().slice(0, 8)}`;
const client = new FirebaseClient();
let stopping = false;
let activeChild = null;

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function eventHasWebSearch(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'type' || key === 'kind') && /web[_-]?search/i.test(String(child))) return true;
    if (child && typeof child === 'object' && eventHasWebSearch(child)) return true;
  }
  return false;
}

function eventHasImageInspection(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'name' || key === 'tool' || key === 'tool_name' || key === 'toolName') && String(child) === 'inspect_product_image') return true;
    if (child && typeof child === 'object' && eventHasImageInspection(child)) return true;
  }
  return false;
}

function safeError(error) {
  return String(error?.message || error || 'Unknown worker error')
    .replace(/((?:refresh_token|id_token|password|api[_-]?key|authorization)\s*[=:]\s*)[^\s,}]+/gi, '$1[redacted]')
    .slice(0, 1000);
}

function buildPrompt(job) {
  return `You are the authorized background research worker for the Kontakt Parameter web application.

Process the existing product task with ID: ${job.taskId}
Exact product name: ${job.productName}
Category: ${job.category}
${job.officialUrl ? `Known official URL: ${job.officialUrl}` : ''}

Use the installed Kontakt Parameter plugin and its product-search skill. First call get_product_search for the task ID above. Never call start_product_search or rerun_product_search: the web application already created and queued this exact task. Fetch its exact category schema, perform the complete native live Codex web-search and image-analysis workflow, validate the draft, and save the result to this task with save_product_search_result. Use inspect_product_image for exact-model images discovered through Web Search so that visual conclusions come from actual pixels, and always save at least one verified exact-product display image. The web-app user already authorized this search and its final save by pressing Search; do not ask for another approval or wait for user input. Never silently substitute a different product variant. Azerbaijani retailer websites are forbidden as evidence, while official Azerbaijani manufacturer pages are allowed. Prefer exact official sources, continue research for missing fields and conflicts as required by the skill, normalize every value to the Kontakt template, and leave unsupported fields unresolved. Do not finish until a validated result is saved or a clear operational error prevents completion.`;
}

async function runJob(job) {
  let webSearchEventCount = 0;
  let imageAnalysisEventCount = 0;
  let lastAgentMessage = '';
  let codexThreadId = '';
  let stderr = '';
  let heartbeatBusy = false;
  let cancelled = false;
  const sendHeartbeat = async (stage = 'Search is running', pct = 10) => {
    if (heartbeatBusy || cancelled) return;
    heartbeatBusy = true;
    try {
      const state = await client.heartbeatCodexJob(workerId, job, { webSearchEventCount, imageAnalysisEventCount, stage, pct });
      if (state.stop) {
        cancelled = state.reason === 'cancelled';
        activeChild?.kill();
      }
    } catch (error) {
      process.stderr.write(`Heartbeat warning: ${safeError(error)}\n`);
    } finally {
      heartbeatBusy = false;
    }
  };

  const visibleTurn = runVisibleCodexTurn({
    cwd: resolve('.'),
    name: `Product search: ${job.productName}`,
    prompt: buildPrompt(job),
    onEvent: event => {
      if (event.method === 'thread/started' && event.params?.thread?.id && !codexThreadId) {
        codexThreadId = String(event.params.thread.id);
        process.stdout.write(`Visible Codex task: ${codexThreadId}\n`);
      }
      if (eventHasWebSearch(event)) {
        webSearchEventCount += 1;
        void sendHeartbeat(`Web research in progress (${webSearchEventCount} searches)`, Math.min(85, 10 + webSearchEventCount * 3));
      }
      if (eventHasImageInspection(event)) {
        imageAnalysisEventCount += 1;
        void sendHeartbeat(`Product images inspected (${imageAnalysisEventCount})`, Math.min(90, 20 + imageAnalysisEventCount * 4));
      }
      const item = event?.params?.item;
      if (item?.type === 'agentMessage' && item.text) lastAgentMessage = String(item.text).slice(-4000);
    },
  });
  const child = visibleTurn.child;
  activeChild = child;
  const heartbeat = setInterval(() => { void sendHeartbeat(); }, HEARTBEAT_MS);
  heartbeat.unref?.();
  await sendHeartbeat('Search process started', 5);

  const completed = await visibleTurn.completion;
  const exitCode = completed.exitCode;
  codexThreadId ||= completed.threadId;
  stderr = `${stderr}\n${completed.error || ''}`.trim().slice(-8000);

  clearInterval(heartbeat);
  activeChild = null;
  const error = cancelled
    ? 'Search cancelled by the user.'
    : exitCode === 0
      ? (lastAgentMessage || 'The search process finished without saving a validated result.')
      : (stderr.trim() || lastAgentMessage || `The search process exited with code ${exitCode}.`);
  return client.finishCodexJob(workerId, job, {
    exitCode: exitCode === 0 ? 1 : exitCode,
    error,
  });
}

async function main() {
  const user = await client.getUser();
  process.stdout.write(`Kontakt Codex worker started as ${user.email || user.displayName || 'super-admin'} (${workerId}).\n`);
  if (user.role !== 'super_admin') process.stdout.write('This account will process only product tasks assigned to it. Use a super-admin account to process searches for every employee.\n');
  process.stdout.write('Keep this window open while web-app searches are running. Press Ctrl+C to stop.\n');
  while (!stopping) {
    const claimed = await client.claimCodexJob(workerId);
    if (!claimed.claimed) {
      if (once) break;
      await sleep(Number(claimed.retryAfterMs || POLL_MS));
      continue;
    }
    process.stdout.write(`Researching ${claimed.job.productName} [${claimed.job.taskId}]\n`);
    try {
      const result = await runJob(claimed.job);
      process.stdout.write(`Job ${claimed.job.taskId}: ${result.status}${result.retry ? ' (queued for retry)' : ''}\n`);
    } catch (error) {
      process.stderr.write(`Job ${claimed.job.taskId} failed: ${safeError(error)}\n`);
      await client.finishCodexJob(workerId, claimed.job, { exitCode: 1, error: safeError(error) }).catch(() => {});
    }
    if (once) break;
  }
}

process.on('SIGINT', () => { stopping = true; activeChild?.kill(); });
process.on('SIGTERM', () => { stopping = true; activeChild?.kill(); });

main().catch(error => {
  process.stderr.write(`Worker stopped: ${safeError(error)}\n`);
  process.exitCode = 1;
});
