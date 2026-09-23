import { removeSession, sessionPath } from '../mcp/auth.mjs';
await removeSession(); console.log(`Kontakt Parameter session removed from ${sessionPath()}.`);
