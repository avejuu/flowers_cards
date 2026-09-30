import { z } from 'zod';
import { cardSchema, type FlowerCard } from './schemas';
import { getDeviceId, deletedIds, loadCards, mergeCards, storeCards } from './storage';
const responseSchema = z.object({ enabled: z.boolean(), cards: z.array(cardSchema).optional() });
let queue: Promise<unknown> = Promise.resolve();
export function backupRequest(body: Record<string, unknown>) {
  const task = queue.catch(() => {}).then(async () => {
    const response = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, deviceId: getDeviceId() }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Die Datenbanksicherung ist gerade nicht erreichbar. Deine lokalen Änderungen bleiben gespeichert.');
    return responseSchema.parse(await response.json());
  });
  queue = task; return task;
}
export async function restoreBackup(onRestore: (cards: FlowerCard[]) => void) {
  getDeviceId();
  // Keep deletion markers locally, even after remote acknowledgement, to prevent stale restore responses.
  for (const id of deletedIds()) await backupRequest({ action: 'delete', id });
  const result = await backupRequest({ action: 'load' });
  if (!result.enabled) return;
  const cards = mergeCards(loadCards(), result.cards || [], deletedIds());
  storeCards(cards); onRestore(cards);
  // Retry locally saved cards after downtime, without replacing local edits with remote versions.
  for (const card of cards) await backupRequest({ action: 'save', card });
}
