import { encodeFields } from './firestore.mjs';

export async function createPendingProfile(config, auth, displayName, fetchImpl = fetch) {
  const root = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
  const now = Date.now();
  const headers = { authorization: `Bearer ${auth.idToken}`, 'content-type': 'application/json' };
  const profile = { email: auth.email, displayName, role: 'pending', createdAt: now, lastLogin: now };
  const profileResponse = await fetchImpl(`${root}/users/${encodeURIComponent(auth.localId)}`, { method: 'PATCH', headers, body: JSON.stringify({ fields: encodeFields(profile) }) });
  const profileBody = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) throw new Error(profileBody?.error?.message || 'Could not create the employee profile.');
  const audit = { actorUid: auth.localId, actorName: displayName, action: 'user.registered', entityType: 'user', entityId: auth.localId, createdAt: now, details: { email: auth.email, role: 'pending' } };
  const auditResponse = await fetchImpl(`${root}/auditLogs?documentId=${crypto.randomUUID()}`, { method: 'POST', headers, body: JSON.stringify({ fields: encodeFields(audit) }) });
  if (!auditResponse.ok) console.warn('Account created, but the registration audit entry could not be saved.');
}
