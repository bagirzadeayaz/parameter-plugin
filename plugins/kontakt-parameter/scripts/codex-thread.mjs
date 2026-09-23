import { spawn } from 'node:child_process';
import readline from 'node:readline';

export function runVisibleCodexTurn({ cwd, name, prompt, onEvent = () => {} }) {
  const child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = readline.createInterface({ input: child.stdout });
  let threadId = '';
  let stderr = '';
  let settled = false;
  let turnStarted = false;
  let threadWasActive = false;
  let idleTimer = null;
  let lastActivityAt = Date.now();
  let inactivityWatchdog = null;
  const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);

  const completion = new Promise(resolvePromise => {
    const timeout = setTimeout(() => {
      finish(1, 'Codex task exceeded the 45-minute execution limit.');
    }, 45 * 60 * 1000);
    timeout.unref?.();

    const finish = (exitCode, error = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (idleTimer) clearTimeout(idleTimer);
      if (inactivityWatchdog) clearInterval(inactivityWatchdog);
      lines.close();
      child.kill();
      resolvePromise({ exitCode, error, threadId });
    };
    inactivityWatchdog = setInterval(() => {
      if (turnStarted && Date.now() - lastActivityAt >= 3 * 60 * 1000) {
        finish(1, 'Codex task stopped emitting events for 3 minutes and was treated as interrupted.');
      }
    }, 15_000);
    inactivityWatchdog.unref?.();
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      lastActivityAt = Date.now();
      stderr = `${stderr}${chunk}`.slice(-8000);
    });
    child.once('error', error => finish(1, String(error?.message || error)));
    child.once('exit', code => { if (!settled) finish(Number(code ?? 1), stderr.trim()); });
    lines.on('line', line => {
      lastActivityAt = Date.now();
      let message;
      try { message = JSON.parse(line); } catch { return; }
      try { onEvent(message); } catch (error) {
        stderr = `${stderr}\nEvent handler warning: ${String(error?.message || error)}`.trim().slice(-8000);
      }
      if (message.id === 0) {
        if (message.error) return finish(1, message.error.message || 'Codex app-server initialization failed.');
        send({ method: 'initialized', params: {} });
        send({ method: 'thread/start', id: 1, params: { cwd, ephemeral: false, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', serviceName: 'kontakt_parameter_worker', config: { web_search: 'live' } } });
      } else if (message.id === 1) {
        if (message.error) return finish(1, message.error.message || 'Could not create the Codex task.');
        threadId = String(message.result?.thread?.id || '');
        if (!threadId) return finish(1, 'Codex did not return a thread ID.');
        send({ method: 'thread/name/set', id: 2, params: { threadId, name: String(name).slice(0, 160) } });
      } else if (message.id === 2) {
        if (message.error) return finish(1, message.error.message || 'Could not name the Codex task.');
        send({ method: 'turn/start', id: 3, params: { threadId, input: [{ type: 'text', text: prompt }] } });
      } else if (message.id === 3) {
        if (message.error) return finish(1, message.error.message || 'Could not start the Codex task.');
        turnStarted = true;
      } else if (message.method === 'turn/started') {
        turnStarted = true;
      } else if (message.method === 'turn/completed') {
        const status = message.params?.turn?.status;
        finish(status === 'completed' ? 0 : 1, status === 'completed' ? '' : `Codex turn ended with status ${status || 'unknown'}.`);
      } else if (message.method === 'thread/status/changed' && message.params?.threadId === threadId) {
        const status = message.params?.status?.type;
        if (status === 'active') threadWasActive = true;
        if (turnStarted && threadWasActive && status === 'systemError') {
          finish(1, 'Codex task entered a system-error state.');
        } else if (turnStarted && threadWasActive && (status === 'idle' || status === 'notLoaded')) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            finish(1, 'Codex task stopped without a turn completion event.');
          }, 5000);
          idleTimer.unref?.();
        }
      }
    });
  });

  send({ method: 'initialize', id: 0, params: { clientInfo: { name: 'kontakt_parameter_worker', title: 'Kontakt Parameter Worker', version: '0.1.0' } } });
  return { child, completion };
}
