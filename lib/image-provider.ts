import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { photoSchema, type Identity, type Photo } from './schemas';
import { searchWikimedia } from './wikimedia-provider';
import { ApiError, requireKey, upstream } from './server';
const TTL = 24 * 60 * 60 * 1000;
const pending = new Map<string, Promise<Photo[]>>();
const cachedSchema = z.object({ createdAt: z.number(), photos: z.array(photoSchema) });
const hitsSchema = z.object({ hits: z.array(z.object({ id: z.number().int(), webformatURL: z.string(), largeImageURL: z.string().optional(), previewURL: z.string().optional(), pageURL: z.string(), user: z.string(), user_id: z.number(), tags: z.string().optional() })) });
export interface ImageProvider { search(identity: Identity): Promise<{ photos: Photo[]; usedQuery: string; warning?: string }> }
async function queryImages(query: string, key: string): Promise<Photo[]> {
  const hash = createHash('sha256').update(query).digest('hex');
  const cacheDir = path.join(process.cwd(), '.data', 'pixabay');
  const filename = path.join(cacheDir, hash + '.json');
  try { const cache = cachedSchema.parse(JSON.parse(await readFile(filename, 'utf8'))); if (Date.now() - cache.createdAt < TTL) return cache.photos.map(photo => ({ ...photo, source: 'pixabay' as const, sourcePageUrl: photo.imagePageUrl, author: photo.imageAuthor, license: 'Pixabay Content License', imageLicense: 'Pixabay Content License', imageLicenseUrl: 'https://pixabay.com/service/license-summary/' })); } catch { /* Missing or expired cache is fetched again. */ }
  const url = new URL('https://pixabay.com/api/');
  url.search = new URLSearchParams({ key, q: query, lang: 'en', image_type: 'photo', safesearch: 'true', per_page: '8' }).toString();
  const parsed = hitsSchema.safeParse(await upstream(url.toString(), {}, 'Pixabay'));
  if (!parsed.success) throw new ApiError(502, 'Pixabay hat ungültige Suchergebnisse geliefert. Bitte versuche es erneut.');
  const photos = parsed.data.hits.flatMap(hit => {
    const result = photoSchema.safeParse({ id: hit.id, imageUrl: hit.largeImageURL || hit.webformatURL, thumbnailUrl: hit.webformatURL || hit.previewURL, source: 'pixabay', sourcePageUrl: hit.pageURL, author: hit.user || 'Unbekannt', license: 'Pixabay Content License', imageLicense: 'Pixabay Content License', imageLicenseUrl: 'https://pixabay.com/service/license-summary/', imageSource: 'Pixabay', imageAuthor: hit.user || 'Unbekannt', imageAuthorUrl: `https://pixabay.com/users/${encodeURIComponent(hit.user)}-${hit.user_id}/`, imagePageUrl: hit.pageURL, alt: hit.tags || query });
    return result.success ? [result.data] : [];
  });
  try { await mkdir(cacheDir, { recursive: true }); const temporary = filename + '.' + crypto.randomUUID() + '.tmp'; await writeFile(temporary, JSON.stringify({ createdAt: Date.now(), photos })); await rename(temporary, filename); }
  catch { /* Search remains usable when the optional cache cannot be written. */ }
  return photos;
}
async function cachedQuery(query: string, key: string) {
  const existing = pending.get(query); if (existing) return existing;
  const request = queryImages(query, key); pending.set(query, request);
  try { return await request; } finally { pending.delete(query); }
}
export const imageProvider: ImageProvider = {
  async search(identity) {
    const photos = new Map<string, Photo>(); let usedQuery = ''; const warnings: string[] = [];
    const add = (items: Photo[]) => { for (const photo of items) if (![...photos.values()].some(existing => existing.imageUrl === photo.imageUrl)) photos.set(`${photo.imageSource}:${photo.id}`, photo); };
    try {
      const key = requireKey('PIXABAY_API_KEY');
      for (const query of [...new Set([identity.englishName, identity.latinName, `${identity.englishName} flower`].filter(Boolean).map(value => value.slice(0, 100)))]) {
        add(await cachedQuery(query, key)); usedQuery = query;
        if (photos.size >= 6) break;
      }
    } catch (error) { warnings.push(error instanceof ApiError ? error.message : 'Pixabay ist gerade nicht erreichbar.'); }
    if (photos.size < 6) {
      try {
        for (const query of [...new Set([identity.latinName, identity.englishName, identity.germanName].filter(Boolean))]) {
          add(await searchWikimedia(query)); usedQuery = query;
          if (photos.size >= 6) break;
        }
      } catch (error) { warnings.push(error instanceof ApiError ? error.message : 'Wikimedia Commons ist gerade nicht erreichbar.'); }
    }
    if (!photos.size && warnings.length) throw new ApiError(503, warnings.join(' '));
    return { photos: [...photos.values()].slice(0, 8), usedQuery, ...(warnings.length ? { warning: warnings.join(' ') } : {}) };
  }
};
