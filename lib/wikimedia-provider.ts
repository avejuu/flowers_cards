import 'server-only';
import { z } from 'zod';
import { photoSchema, type Photo } from './schemas';
import { upstream, ApiError } from './server';
const metadata = z.record(z.string(), z.object({ value: z.union([z.string(), z.number()]).transform(String).optional() }));
const results = z.object({ query: z.object({ pages: z.record(z.string(), z.object({ pageid: z.number(), title: z.string(), index: z.number().optional(), imageinfo: z.array(z.object({ url: z.string(), thumburl: z.string().optional(), descriptionurl: z.string(), mime: z.string(), user: z.string().optional(), extmetadata: metadata.optional() })).optional() })) }).optional() });
// Metadata is untrusted HTML; display plain text, never inject markup.
function plain(value = '') { return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(); }
export async function searchWikimedia(query: string): Promise<Photo[]> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|mime|user|extmetadata', iiurlwidth: '600' }).toString();
  const parsed = results.safeParse(await upstream(url.toString(), { headers: { 'User-Agent': 'FlowerCards/1.0 (plant image search)' } }, 'Wikimedia Commons'));
  if (!parsed.success) throw new ApiError(502, 'Wikimedia Commons hat ungültige Suchergebnisse geliefert.');
  return Object.values(parsed.data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap(page => {
    const image = page.imageinfo?.[0]; if (!image || !['image/jpeg', 'image/png', 'image/webp'].includes(image.mime)) return [];
    const meta = image.extmetadata || {}; const author = plain(meta.Artist?.value || image.user || 'Unbekannt').slice(0, 120); const license = plain(meta.LicenseShortName?.value || meta.UsageTerms?.value).slice(0, 500);
    if (!license) return []; // Only offer files with usable license information.
    const photo = photoSchema.safeParse({ id: page.pageid, imageUrl: image.url, thumbnailUrl: image.thumburl || image.url, source: 'wikimedia', sourcePageUrl: image.descriptionurl, author, license, imageSource: 'Wikimedia', imagePageUrl: image.descriptionurl, imageAuthor: author || 'Unbekannt', imageLicense: license, imageLicenseUrl: meta.LicenseUrl?.value?.startsWith('https://') ? meta.LicenseUrl.value : undefined, alt: plain(page.title.replace(/^File:/, '')).slice(0, 1000) });
    return photo.success ? [photo.data] : [];
  });
}
