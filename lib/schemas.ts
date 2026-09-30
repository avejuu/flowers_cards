import { z } from 'zod';
const shortText = z.string().trim().min(1).max(120);
export const nameInput = z.string().trim().min(1, 'Bitte gib einen Blumennamen ein.').max(100, 'Der Blumenname darf höchstens 100 Zeichen haben.').regex(/^[\p{L}\p{M}\s.'’()\-]+$/u, 'Bitte gib einen gültigen Blumennamen ein.');
export const identitySchema = z.object({ germanName: shortText, englishName: shortText, latinName: z.string().trim().max(120) });
export const resolutionSchema = z.object({ isValidPlant: z.boolean(), germanName: z.string().trim().max(120), englishName: z.string().trim().max(120), latinName: z.string().trim().max(120) });
export const infoSchema = z.object({ haltbarkeit: z.string().trim().min(1).max(600), kombiniertMit: z.string().trim().min(1).max(600), verarbeitung: z.string().trim().min(1).max(1000), verwendung: z.string().trim().min(1).max(600) });
export const generatedSchema = identitySchema.extend(infoSchema.shape);
export const providerUrl = (host: string) => z.string().url().refine(value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && (url.hostname === host || url.hostname.endsWith('.' + host)); } catch { return false; } });
const pixabayImageUrl = providerUrl('pixabay.com');
const commonsImageUrl = providerUrl('upload.wikimedia.org');
// Download endpoints must only contact known image hosts, never arbitrary subdomains.
export const downloadableImageUrl = z.string().url().refine(value => {
  try {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    ['pixabay.com', 'cdn.pixabay.com', 'upload.wikimedia.org'].includes(url.hostname) && !url.hash &&
    [...url.searchParams.keys()].every(key => ['utm_source', 'utm_campaign', 'utm_content'].includes(key)) &&
    (url.hostname !== 'pixabay.com' || url.pathname.startsWith('/get/'));
  } catch { return false; }
}, 'Unsupported remote image URL');
const savedImageUrl = z.union([commonsImageUrl, pixabayImageUrl, providerUrl('images.pexels.com'), z.string().regex(/^\/api\/images\/[a-f0-9]{64}\.(jpg|png|webp)$/)]);
const sourcePageUrl = z.union([providerUrl('pixabay.com'), providerUrl('pexels.com'), providerUrl('commons.wikimedia.org')]);
export const photoSchema = z.object({ id: z.number().int(), imageUrl: z.union([pixabayImageUrl, commonsImageUrl]), thumbnailUrl: z.union([pixabayImageUrl, commonsImageUrl, providerUrl('thumb.wikimedia.org')]), source: z.enum(['pixabay', 'wikimedia']).optional(), sourcePageUrl: sourcePageUrl.optional(), author: shortText.optional(), license: z.string().max(500).optional(), imageSource: z.enum(['Pixabay', 'Wikimedia']), imageAuthor: shortText, imageAuthorUrl: sourcePageUrl.optional(), imagePageUrl: sourcePageUrl, imageLicense: z.string().max(500).optional(), imageLicenseUrl: z.string().url().startsWith('https://').optional(), alt: z.string().max(1000) });
export const cardSchema = generatedSchema.extend({ id: z.string().min(1), imageUrl: savedImageUrl, imageSource: z.enum(['Pixabay', 'Pexels', 'Wikimedia']), imageAuthor: shortText, imageAuthorUrl: sourcePageUrl.optional(), imagePageUrl: sourcePageUrl.optional(), imageLicense: z.string().max(500).optional(), imageLicenseUrl: z.string().url().startsWith('https://').optional(), updatedAt: z.string().datetime().optional(), imageOriginalUrl: z.union([commonsImageUrl, pixabayImageUrl, providerUrl('images.pexels.com')]).optional(), createdAt: z.string().datetime() });
export type Identity = z.infer<typeof identitySchema>;
export type FlowerInfo = z.infer<typeof infoSchema>;
export type Photo = z.infer<typeof photoSchema>;
export type FlowerCard = z.infer<typeof cardSchema>;
export const fieldLabels: Record<keyof FlowerInfo, string> = { haltbarkeit: 'Haltbarkeit', kombiniertMit: 'Kombiniert sich mit', verarbeitung: 'Verarbeitung', verwendung: 'Verwendung' };
export function parseModelJson(text: string): unknown { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
