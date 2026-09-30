import test from 'node:test';
import assert from 'node:assert/strict';
import { cardSchema, generatedSchema, nameInput, parseModelJson } from '../lib/schemas';
import { decodeCards } from '../lib/storage';
const card = { id: 'one', germanName: 'Strandflieder', englishName: 'Sea lavender', latinName: 'Limonium', imageUrl: 'https://cdn.pixabay.com/photo/1/photo.jpeg', imageSource: 'Pixabay' as const, imageAuthor: 'Anna', imageAuthorUrl: 'https://pixabay.com/users/anna-1/', imagePageUrl: 'https://pixabay.com/photos/1/', haltbarkeit: '7–14 Tage', kombiniertMit: 'Rosen', verarbeitung: 'Stiele anschneiden.', verwendung: 'Beiwerk', createdAt: '2026-09-29T12:00:00.000Z' };
test('validates German names, empty input, excessive length and injected instructions', () => { assert.equal(nameInput.parse('  Strandflieder  '), 'Strandflieder'); for (const value of ['', '   ', 'a'.repeat(101), '<script>', '123']) assert.equal(nameInput.safeParse(value).success, false); });
test('parses fenced JSON and rejects malformed or incomplete model output', () => { assert.equal(generatedSchema.parse(parseModelJson('```json\n' + JSON.stringify(card) + '\n```')).germanName, card.germanName); assert.throws(() => parseModelJson('{invalid}')); assert.equal(generatedSchema.safeParse({ germanName: 'Rose' }).success, false); });
test('storage round-trip and absent storage', () => { assert.deepEqual(decodeCards(null), []); assert.deepEqual(decodeCards(JSON.stringify([card])), [card]); });
test('corrupted storage and unsafe URLs are rejected', () => { assert.throws(() => decodeCards('broken')); assert.throws(() => decodeCards('{}')); assert.equal(cardSchema.safeParse({ ...card, imageUrl: 'javascript:alert(1)' }).success, false); assert.equal(cardSchema.safeParse({ ...card, imageAuthorUrl: 'https://evil.test' }).success, false); });
test('legacy saved Pexels cards remain available after provider switch', () => {
  const legacy = { ...card, imageUrl: undefined, imageSource: undefined, imageAuthor: undefined, imageAuthorUrl: undefined, imagePageUrl: undefined, photoUrl: 'https://images.pexels.com/photos/1/photo.jpeg', photographerName: 'Anna', photographerUrl: 'https://www.pexels.com/@anna', pexelsUrl: 'https://www.pexels.com/photo/1' };
  const decoded = decodeCards(JSON.stringify([legacy])); assert.equal(decoded[0].imageSource, 'Pexels'); assert.equal(decoded[0].imageAuthor, 'Anna'); assert.equal(decoded[0].id, card.id);
});

test('restore merges missing cards, preserves local edits, and respects deletion markers', async () => {
  const { mergeCards } = await import('../lib/storage');
  const local = { ...card, haltbarkeit: 'lokale Änderung' };
  const missing = { ...card, id: 'missing' }; const deleted = { ...card, id: 'deleted' };
  assert.deepEqual(mergeCards([local], [card, missing, deleted], ['deleted']), [local, missing]);
});
