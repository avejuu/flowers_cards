import test from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { POST } from '../app/api/images/upload/route';
import { GET } from '../app/api/images/[filename]/route';
import { IMAGE_DIR } from '../lib/image-files';
import { cardSchema } from '../lib/schemas';
import { decodeCards } from '../lib/storage';
const samples = { 'image/jpeg': Buffer.from([255,216,255,224]), 'image/png': Buffer.from([137,80,78,71,13,10,26,10]), 'image/webp': Buffer.from('RIFF0000WEBP') };
for (const [type, bytes] of Object.entries(samples)) test(`${type}: upload uses internal storage and survives card serialization`, async () => {
  const response = await POST(new Request('http://localhost/api/images', { method: 'POST', headers: { 'Content-Type': type }, body: bytes }));
  assert.equal(response.status, 200);
  const { imageUrl } = await response.json(); const filename = imageUrl.split('/').pop();
  try {
    assert.match(filename, /^[a-f0-9]{64}\.(jpg|png|webp)$/);
    const stored = await GET(new Request('http://localhost' + imageUrl), { params: Promise.resolve({ filename }) });
    assert.equal(stored.headers.get('content-type'), type);
    assert.deepEqual(Buffer.from(await stored.arrayBuffer()), bytes);
    const card = cardSchema.parse({ id: 'upload', germanName: 'Rose', englishName: 'Rose', latinName: 'Rosa', imageUrl, imageSource: 'upload', imageAuthor: null, imageLicense: null, imageSourcePage: null, haltbarkeit: '7 Tage', kombiniertMit: 'Grün', verarbeitung: 'Anschneiden', verwendung: 'Strauß', createdAt: new Date().toISOString() });
    assert.deepEqual(decodeCards(JSON.stringify([card])), [card]);
  } finally { await unlink(path.join(IMAGE_DIR, filename)); }
});
test('rejects unsupported, disguised and oversized uploads, including streamed bodies', async () => {
  for (const [type, bytes, status] of [['text/plain', Buffer.from('text'), 415], ['image/png', Buffer.from('<script>evil</script>'), 415], ['image/png', Buffer.alloc(10 * 1024 * 1024 + 1), 413]] as const) {
    const response = await POST(new Request('http://localhost/api/images', { method: 'POST', headers: { 'Content-Type': type }, body: bytes }));
    assert.equal(response.status, status); assert.ok((await response.json()).error);
  }
  assert.equal((await GET(new Request('http://localhost/api/images/x'), { params: Promise.resolve({ filename: '../secrets.png' }) })).status, 404);
});
