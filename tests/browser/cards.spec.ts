import { test, expect } from '@playwright/test';
const identity = { germanName: 'Strandflieder', englishName: 'Sea lavender', latinName: 'Limonium' };
const info = { haltbarkeit: '7–14 Tage', kombiniertMit: 'Rosen', verarbeitung: 'Stiele anschneiden.', verwendung: 'Beiwerk' };
const photo = { id: 1, imageUrl: 'https://cdn.pixabay.com/photo/1/large.jpg', thumbnailUrl: 'https://cdn.pixabay.com/photo/1/medium.jpg', imageSource: 'Pixabay', imageAuthor: 'Anna', imageAuthorUrl: 'https://pixabay.com/users/anna-1/', imagePageUrl: 'https://pixabay.com/photos/1/', alt: 'Strandflieder' };
test('create, explicitly verify, edit, save, reload, flip and delete', async ({ page }) => {
  await page.route('https://cdn.pixabay.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#9baa80"/></svg>' }));
  await page.route('**/api/images', route => route.fulfill({ json: { imageUrl: '/api/images/' + 'a'.repeat(64) + '.jpg' } }));
  await page.route('**/api/images/*.jpg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#9baa80"/></svg>' }));
  await page.route('**/api/search', route => route.fulfill({ json: { identity, photos: [photo], usedQuery: 'Sea lavender' } }));
  let verifications = 0;
  await page.route('**/api/card', route => { const data = route.request().postDataJSON(); if (data.action === 'verify') verifications++; return route.fulfill({ json: { ...identity, ...info, haltbarkeit: data.action === 'verify' ? '10–14 Tage' : info.haltbarkeit } }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Neue Karte' }).click();
  await page.getByLabel('Blumenname', { exact: true }).fill('Strandflieder'); await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Karte erstellen', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Foto von Anna auswählen' }).click(); await page.getByRole('button', { name: 'Karte erstellen', exact: true }).click();
  await expect(page.getByLabel('Haltbarkeit', { exact: true })).toHaveValue('7–14 Tage'); expect(verifications).toBe(0);
  await page.getByRole('button', { name: 'Informationen prüfen' }).click(); await expect(page.getByText('Vorschlag nach der Prüfung')).toBeVisible();
  await page.getByRole('button', { name: 'Änderungen übernehmen' }).click(); await page.getByLabel('Verwendung', { exact: true }).fill('Trockenblume');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click(); await page.reload();
  await expect(page.getByRole('button', { name: 'Strandflieder: Rückseite anzeigen' })).toBeVisible();
  await page.getByRole('button', { name: 'Strandflieder: Rückseite anzeigen' }).click(); await expect(page.getByRole('button', { name: 'Strandflieder: Vorderseite anzeigen' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click(); await expect(page.getByLabel('Verwendung', { exact: true })).toHaveValue('Trockenblume');
  await page.getByLabel('Haltbarkeit', { exact: true }).fill('12 Tage'); await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click(); await page.getByRole('button', { name: 'Abbrechen' }).click(); await expect(page.locator('.library-grid article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Löschen', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Löschen', exact: true }).click(); await page.reload(); await expect(page.getByText('Platz für deine erste Blume.')).toBeVisible();
});
test('mobile layout and missing API keys', async ({ page }) => { await page.route('**/api/search', route => route.fulfill({ status: 503, json: { error: 'Der API-Schlüssel PIXABAY_API_KEY fehlt.' } })); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('button', { name: 'Neue Karte' }).click(); await page.getByLabel('Blumenname').fill('Rose'); await page.getByRole('button', { name: 'Suchen', exact: true }).click(); await expect(page.locator('main').getByRole('alert')).toContainText('API-Schlüssel'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); });

const plantNames = ['Einblatt', 'Spathiphyllum', 'Orchidee', 'Anthurie', 'Rose', 'Tulpe', 'Eukalyptus', 'Monstera', 'Schleierkraut', 'Hortensie', 'Lavendel', 'Geranie'];
for (const name of plantNames) test(`complete local flow with unavailable backup: ${name}`, async ({ page }) => {
  const plant = { germanName: name === 'Spathiphyllum' ? 'Einblatt' : name, englishName: 'Plant', latinName: name };
  await page.route('**/api/backup', route => route.fulfill({ status: 503, json: { error: 'Datenbank nicht erreichbar' } }));
  await page.route('**/api/images', route => route.fulfill({ json: { imageUrl: '/api/images/' + 'b'.repeat(64) + '.jpg' } }));
  await page.route('**/api/images/*.jpg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="green"/></svg>' }));
  await page.route('https://upload.wikimedia.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="green"/></svg>' }));
  const commons = { ...photo, source: 'wikimedia', imageSource: 'Wikimedia', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/plant.jpg', thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/plant.jpg', imagePageUrl: 'https://commons.wikimedia.org/wiki/File:Plant.jpg', imageAuthorUrl: undefined, imageLicense: 'CC BY-SA 4.0' };
  await page.route('**/api/search', route => route.fulfill({ json: { identity: plant, photos: [commons], usedQuery: name } }));
  let verifyCount = 0;
  await page.route('**/api/card', route => { if (route.request().postDataJSON().action === 'verify') verifyCount++; return route.fulfill({ json: { ...plant, ...info } }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Neue Karte' }).click();
  await page.getByLabel('Blumenname').fill(name); await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  const create = page.getByRole('button', { name: 'Karte erstellen', exact: true }); await expect(create).toBeDisabled();
  const choice = page.getByRole('button', { name: 'Foto von Anna auswählen' }); await choice.click(); await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await create.click(); await expect(page.getByLabel('Haltbarkeit', { exact: true })).toHaveValue(info.haltbarkeit); expect(verifyCount).toBe(0);
  await page.getByLabel('Verwendung', { exact: true }).fill('Dekoration'); await page.getByRole('button', { name: 'Informationen prüfen' }).click();
  await expect(page.getByText('Vorschlag nach der Prüfung')).toBeVisible(); await page.getByRole('button', { name: 'Bisherige Angaben behalten' }).click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('.library-grid article')).toHaveCount(1); await page.reload();
  await expect(page.getByRole('button', { name: `${plant.germanName}: Rückseite anzeigen` })).toBeVisible();
  await page.getByRole('button', { name: `${plant.germanName}: Rückseite anzeigen` }).click();
  await expect(page.getByRole('button', { name: `${plant.germanName}: Vorderseite anzeigen` })).toHaveAttribute('aria-pressed', 'true');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('blumenkarten:v1')!)); assertLocal(stored, plant.germanName);
  await page.getByRole('button', { name: 'Löschen', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(page.locator('.library-grid article')).toHaveCount(0); await page.reload(); await expect(page.locator('.library-grid article')).toHaveCount(0);
});
function assertLocal(cards: { germanName: string; verwendung: string }[], name: string) { expect(cards).toHaveLength(1); expect(cards[0].germanName).toBe(name); expect(cards[0].verwendung).toBe('Dekoration'); }

test('backup save, restore, local edit precedence, deduplication and failed deletion retry', async ({ page }) => {
  let remote: Record<string, unknown>[] = []; let failDelete = false; let saves = 0;
  await page.route('**/api/backup', async route => {
    const body = route.request().postDataJSON();
    expect(body.deviceId).toMatch(/^[a-f0-9-]{36}$/);
    if (body.action === 'load') return route.fulfill({ json: { enabled: true, cards: remote } });
    if (body.action === 'save') {
      // Local storage must already contain the card before its backup is requested.
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('blumenkarten:v1') || '[]').length)).toBeGreaterThan(0);
      remote = [body.card]; saves++; return route.fulfill({ json: { enabled: true } });
    }
    if (failDelete) return route.fulfill({ status: 503, json: { error: 'Offline' } });
    remote = remote.filter(card => card.id !== body.id); return route.fulfill({ json: { enabled: true } });
  });
  await page.goto('/');
  const saved = { ...identity, ...info, ...photo, id: '0985aa2c-e838-41ee-b422-9b26897b32e7', createdAt: '2026-09-30T10:00:00.000Z' };
  await page.evaluate(card => localStorage.setItem('blumenkarten:v1', JSON.stringify([card])), saved);
  await page.reload(); await expect.poll(() => saves).toBeGreaterThan(0);
  const deviceId = await page.evaluate(() => localStorage.getItem('blumenkarten:deviceId'));
  await page.evaluate(() => localStorage.removeItem('blumenkarten:v1')); await page.reload();
  await expect(page.locator('.library-grid article')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('blumenkarten:deviceId'))).toBe(deviceId);
  await page.reload(); await expect(page.locator('.library-grid article')).toHaveCount(1);
  failDelete = true; await page.getByRole('button', { name: 'Löschen', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(page.locator('.library-grid article')).toHaveCount(0); await page.reload(); await expect(page.locator('.library-grid article')).toHaveCount(0);
  failDelete = false; await page.reload(); await expect.poll(() => remote.length).toBe(0);
});
