import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const IMAGE_ACCEPT_HEADER = [...ALLOWED_TYPES].join(',');

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

function isPrivateAddress(address) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc')
    || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized.startsWith('::ffff:127.');
}

async function assertPublicHttps(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('Image URL must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Image URL must use public HTTPS without embedded credentials.');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('Private or local image addresses are not allowed.');
  return url;
}

export async function fetchProductImage(rawUrl, { fetchImpl = fetch, maxRedirects = 3 } = {}) {
  let url = await assertPublicHttps(rawUrl);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetchImpl(url, {
      redirect: 'manual',
      headers: { accept: IMAGE_ACCEPT_HEADER },
      signal: AbortSignal.timeout(20_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === maxRedirects) throw new Error('Image redirected too many times.');
      url = await assertPublicHttps(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) throw new Error('URL did not return a supported image format.');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_IMAGE_BYTES) throw new Error('Image is larger than 8 MB.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Image is empty or larger than 8 MB.');
    return { imageUrl: url.toString(), mimeType, bytes: bytes.length, data: Buffer.from(bytes).toString('base64') };
  }
  throw new Error('Image retrieval failed.');
}
