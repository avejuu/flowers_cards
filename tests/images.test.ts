import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { POST } from '../app/api/images/route';
import { GET } from '../app/api/images/[filename]/route';
import { IMAGE_DIR } from '../lib/image-files';
const url = 'https://cdn.pixabay.com/photo/flower-cards-test-only-87654321.jpg';
const hash = createHash('sha256').update(url).digest('hex');
const filepath = `${IMAGE_DIR}/${hash}.jpg`;
const originalFetch = global.fetch;
test.afterEach(() => { global.fetch = originalFetch; });
test.after(async () => { await rm(filepath, { force: true }); });
test('selected image is downloaded once, stored locally and served after reload', async () => {
  await rm(filepath, { force: true });
  let calls = 0; const jpeg = Buffer.from([255,216,255,224,0,16,74,70,73,70]);
  global.fetch = async () => { calls++; return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }); };
  const request = () => new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: url }) });
  const first = await POST(request()); assert.equal(first.status, 200); assert.equal((await first.json()).imageUrl, `/api/images/${hash}.jpg`);
  assert.deepEqual(await readFile(filepath), jpeg);
  assert.equal((await POST(request())).status, 200); assert.equal(calls, 1);
  const served = await GET(new Request('http://localhost'), { params: Promise.resolve({ filename: `${hash}.jpg` }) }); assert.equal(served.status, 200); assert.equal(served.headers.get('Content-Type'), 'image/jpeg');
});
test('download rejects foreign hosts and serving rejects traversal', async () => {
  const result = await POST(new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: 'https://evil.example/image.jpg' }) })); assert.equal(result.status, 400);
  const served = await GET(new Request('http://localhost'), { params: Promise.resolve({ filename: '../secret' }) }); assert.equal(served.status, 404);
});
test('download failure is recoverable and does not leak upstream errors', async () => {
  global.fetch = async () => { throw new Error('secret'); };
  const response = await POST(new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: 'https://cdn.pixabay.com/photo/test-failure.jpg' }) })); assert.equal(response.status, 503); assert.doesNotMatch((await response.json()).error, /secret/);
});
