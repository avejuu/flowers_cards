import { newId } from './id';
import { z } from 'zod';
import { cardSchema, type FlowerCard } from './schemas';
export const STORAGE_KEY = 'blumenkarten:v1';
// Read old Pexels cards without changing or dropping existing user data.
export function decodeCards(value: string | null): FlowerCard[] {
  if (value === null) return [];
  const data = z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(value));
  return data.map(card => cardSchema.parse(card.imageUrl ? card : { ...card, imageUrl: card.photoUrl, imageSource: 'Pexels', imageAuthor: card.photographerName, imageAuthorUrl: card.photographerUrl, imagePageUrl: card.pexelsUrl }));
}
export function loadCards(): FlowerCard[] { return decodeCards(localStorage.getItem(STORAGE_KEY)); }
export function storeCards(cards: FlowerCard[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); }
export const DEVICE_KEY = 'blumenkarten:deviceId';
export const DELETED_KEY = 'blumenkarten:deleted';
export function getDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_KEY);
  if (stored) return z.uuid().parse(stored);
  const id = newId(); localStorage.setItem(DEVICE_KEY, id); return id;
}
export function deletedIds(): string[] { return z.array(z.string()).parse(JSON.parse(localStorage.getItem(DELETED_KEY) || '[]')); }
export function markDeleted(id: string) { localStorage.setItem(DELETED_KEY, JSON.stringify([...new Set([...deletedIds(), id])])); }
export function mergeCards(local: FlowerCard[], remote: FlowerCard[], deleted: string[]): FlowerCard[] {
  const merged = new Map(local.map(card => [card.id, card]));
  for (const card of remote) if (!merged.has(card.id) && !deleted.includes(card.id)) merged.set(card.id, card);
  return [...merged.values()].filter(card => !deleted.includes(card.id));
}
