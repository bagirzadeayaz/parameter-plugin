import { startBrowserAuth } from '../mcp/browser-auth.mjs';

try {
  console.log('\nKontakt Parameter account setup');
  const flow = await startBrowserAuth({ launch: true });
  console.log('A secure sign-in window was opened in your browser.');
  console.log(`If it did not open, visit: ${flow.url}`);
  console.log('This link expires in five minutes.');
  const result = await flow.completion;
  if (!result.ok) throw new Error(result.expired ? 'The sign-in request expired.' : result.message || 'Account setup was cancelled.');
  if (result.pending) console.log(`Account ready for ${result.email}. An administrator must approve it before product searches can run.`);
  else console.log(`Signed in as ${result.email}. Kontakt Parameter is ready to use.`);
} catch (error) {
  console.error(`Account setup failed: ${error?.message || error}`);
  process.exitCode = 1;
}
