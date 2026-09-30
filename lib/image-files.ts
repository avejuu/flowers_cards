import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, access, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from './server';
import { downloadableImageUrl } from './schemas';
import { imageErrorMessage } from './image-errors';
export const IMAGE_DIR = path.join(process.cwd(), '.data', 'images');
const MAX_BYTES = 10 * 1024 * 1024;
export async function downloadImage(url: string) {
  downloadableImageUrl.parse(url);
  const hash = createHash('sha256').update(url).digest('hex');
  for (const ext of ['jpg', 'png', 'webp']) { const filename = `${hash}.${ext}`; try { await access(path.join(IMAGE_DIR, filename)); return `/api/images/${filename}`; } catch { /* Not downloaded yet. */ } }
  let stage = 'fetch';
  try {
    const signal = AbortSignal.timeout(30000);
    let target = url;
    let response: Response;
    for (let redirects = 0; ; redirects++) {
      downloadableImageUrl.parse(target);
      response = await fetch(target, { redirect: 'manual', signal, headers: { 'User-Agent': 'FlowerCards/1.0 (image backup)' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects >= 5) throw new Error('Invalid or excessive image redirects');
      target = new URL(location, target).toString();
    }
    if (!response.ok || !response.body) throw new Error(`Image download returned HTTP ${response.status}`);
    stage = 'image validation';
    const type = response.headers.get('content-type')?.split(';')[0];
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[type || ''];
    if (!ext || Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error(`Unsupported image type (${type || 'missing'}) or image exceeds 10 MiB`);
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Image exceeds 10 MiB'); } chunks.push(value); }
    const bytes = Buffer.concat(chunks);
    // Check file signatures before serving data from our own origin.
    const valid = ext === 'jpg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid) throw new Error('Invalid signature');
    stage = 'server file storage';
    await mkdir(IMAGE_DIR, { recursive: true }); const filename = `${hash}.${ext}`; const temporary = path.join(IMAGE_DIR, filename + '.' + randomUUID() + '.tmp'); await writeFile(temporary, bytes); await rename(temporary, path.join(IMAGE_DIR, filename));
    return `/api/images/${filename}`;
  } catch (error) {
    const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
    const secrets = [process.env.PIXABAY_API_KEY || '', process.env.GEMINI_API_KEY || ''];
    console.error('[image-copy]', { stage, host: new URL(url).hostname, error: imageErrorMessage(error, secrets), ...(cause ? { cause: imageErrorMessage(cause, secrets) } : {}) });
    throw new ApiError(503, 'Das Foto konnte nicht gespeichert werden. Bitte prüfe die Verbindung und die Schreibrechte des Servers und versuche es erneut.'); }
}

// Uploads use the same safe internal path format as downloaded images.
export async function uploadImage(request: Request) {
  const type = request.headers.get('content-type')?.split(';')[0];
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[type || ''];
  if (!ext) throw new ApiError(415, 'Bitte wähle ein JPEG-, PNG- oder WebP-Bild.');
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) throw new ApiError(413, 'Das Foto ist zu groß. Maximal 10 MB sind erlaubt.');
  if (!request.body) throw new ApiError(400, 'Bitte wähle ein Bild aus.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); throw new ApiError(413, 'Das Foto ist zu groß. Maximal 10 MB sind erlaubt.'); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  const valid = ext === 'jpg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid) throw new ApiError(415, 'Die Datei ist kein gültiges JPEG-, PNG- oder WebP-Bild.');
  const filename = `${createHash('sha256').update(randomUUID()).digest('hex')}.${ext}`;
  try {
    await mkdir(IMAGE_DIR, { recursive: true });
    await writeFile(path.join(IMAGE_DIR, filename), bytes, { flag: 'wx' });
  } catch { throw new ApiError(503, 'Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.'); }
  return `/api/images/${filename}`;
}
