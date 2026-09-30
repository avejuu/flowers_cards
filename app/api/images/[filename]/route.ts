import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { IMAGE_DIR, readUploadedImage } from '@/lib/image-files';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  if (!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(filename)) return new Response('Nicht gefunden', { status: 404 });
  try { const bytes = await readFile(path.join(IMAGE_DIR, filename)).catch(() => readUploadedImage(filename)); if (!bytes) return new Response('Foto nicht verfügbar', { status: 404 }); const type = filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.png') ? 'image/png' : 'image/webp'; return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' } }); }
  catch { return new Response('Foto nicht verfügbar', { status: 404 }); }
}
