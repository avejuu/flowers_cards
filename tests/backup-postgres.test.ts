import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { POST } from '../app/api/backup/route';
import { POST as uploadPhoto } from '../app/api/images/upload/route';
import { GET as getPhoto } from '../app/api/images/[filename]/route';
const deviceId = '0c5e8742-8f05-4fb5-b354-bbdf532c4bd8';
const otherDevice = '3bbd71b5-5b2a-460a-88ca-00c8b4d06671';
const card = { id: 'a157d240-526e-4fc3-abd1-92320753f77d', germanName: 'Einblatt', englishName: 'Peace lily', latinName: 'Spathiphyllum', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/plant.jpg', imageSource: 'Wikimedia', imagePageUrl: 'https://commons.wikimedia.org/wiki/File:Plant.jpg', imageAuthor: 'Artist', imageLicense: 'CC BY-SA 4.0', haltbarkeit: 'Mehrjährig als Topfpflanze', kombiniertMit: 'Monstera', verarbeitung: 'Als Topfpflanze verwenden.', verwendung: 'Raumdekoration', createdAt: '2026-09-30T10:00:00.000Z', updatedAt: '2026-09-30T10:00:00.000Z' };
async function api(body: object) { return POST(new Request('http://localhost/api/backup', { method: 'POST', body: JSON.stringify(body) })); }
test('PostgreSQL schema, save/update, device isolation, restore and tombstone semantics', async t => {
  const db = new PGlite(); const previous = process.env.DATABASE_URL; process.env.DATABASE_URL = 'postgresql://test-only';
  // Run the production SQL against the embedded PostgreSQL engine instead of a remote socket.
  t.mock.method(Pool.prototype, 'query', async (sql: string, values?: unknown[]) => {
    if (sql.startsWith('CREATE TABLE')) { await db.exec(sql); return { rows: [], rowCount: 0 }; }
    const result = await db.query(sql, values); return { rows: result.rows, rowCount: result.affectedRows };
  });
  try {
    const bytes = Buffer.from([137,80,78,71,13,10,26,10]);
    const uploaded = await uploadPhoto(new Request('http://localhost/api/images/upload', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes }));
    assert.equal(uploaded.status, 200);
    const { imageUrl } = await uploaded.json();
    const filename = imageUrl.split('/').pop();
    const imageRow = await db.query('SELECT bytes FROM flower_images WHERE filename=$1', [filename]);
    assert.deepEqual(Buffer.from((imageRow.rows[0] as { bytes: Uint8Array }).bytes), bytes);
    const restoredPhoto = await getPhoto(new Request('http://localhost' + imageUrl), { params: Promise.resolve({ filename }) });
    assert.equal(restoredPhoto.status, 200);
    assert.deepEqual(Buffer.from(await restoredPhoto.arrayBuffer()), bytes);
    assert.equal((await api({ action: 'save', deviceId, card })).status, 200);
    const load = await api({ action: 'load', deviceId }); assert.deepEqual((await load.json()).cards, [card]);
    assert.deepEqual((await (await api({ action: 'load', deviceId: otherDevice })).json()).cards, []);
    assert.equal((await api({ action: 'save', deviceId: otherDevice, card })).status, 409);
    const edited = { ...card, verwendung: 'Bearbeitet', updatedAt: '2026-09-30T11:00:00.000Z' };
    assert.equal((await api({ action: 'save', deviceId, card: edited })).status, 200);
    assert.equal((await api({ action: 'save', deviceId, card })).status, 409);
    assert.deepEqual((await (await api({ action: 'load', deviceId })).json()).cards, [edited]);
    assert.equal((await api({ action: 'delete', deviceId: otherDevice, id: card.id })).status, 200);
    assert.equal((await (await api({ action: 'load', deviceId })).json()).cards.length, 1);
    assert.equal((await api({ action: 'delete', deviceId, id: card.id })).status, 200);
    assert.deepEqual((await (await api({ action: 'load', deviceId })).json()).cards, []);
    assert.equal((await api({ action: 'save', deviceId, card: edited })).status, 409);
    const upload = { ...card, id: 'd2277d50-477a-4a36-9670-10d9a75edce3', imageUrl: `/api/images/${'a'.repeat(64)}.png`, imageSource: 'upload', imageAuthor: null, imageLicense: null, imageSourcePage: null, imagePageUrl: undefined };
    assert.equal((await api({ action: 'save', deviceId, card: upload })).status, 200);
    assert.deepEqual((await (await api({ action: 'load', deviceId })).json()).cards, [JSON.parse(JSON.stringify(upload))]);
    const row = await db.query('SELECT image_url, image_source, image_author FROM flower_cards_backup WHERE id=$1', [upload.id]);
    assert.deepEqual(row.rows[0], { image_url: upload.imageUrl, image_source: 'upload', image_author: '' });
    assert.equal((await api({ action: 'delete', deviceId, id: upload.id })).status, 200);
    assert.deepEqual((await (await api({ action: 'load', deviceId })).json()).cards, []);
    const lateId = 'd2795f01-67ea-4336-b120-bb92ea7e31cf';
    assert.equal((await api({ action: 'delete', deviceId, id: lateId })).status, 200);
    assert.equal((await api({ action: 'save', deviceId, card: { ...edited, id: lateId } })).status, 409);
  } finally { await db.close(); if (previous) process.env.DATABASE_URL = previous; else delete process.env.DATABASE_URL; }
});
