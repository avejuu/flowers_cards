import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { IMAGE_DIR } from '@/lib/image-files';
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  if (!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(filename)) return new Response('Nicht gefunden', { status: 404 });
  try { const bytes = await readFile(path.join(IMAGE_DIR, filename)); const type = filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.png') ? 'image/png' : 'image/webp'; return new Response(bytes, { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' } }); }
  catch { return new Response('Foto nicht verfügbar', { status: 404 }); }
}
