import { z } from 'zod';
import { cardSchema } from '@/lib/schemas';
import { readBody, errorResponse, ApiError } from '@/lib/server';
import { readBackup, writeBackup, deleteBackup } from '@/lib/backup-db';
export const runtime = 'nodejs';
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('load'), deviceId: z.uuid() }),
  z.object({ action: z.literal('save'), deviceId: z.uuid(), card: cardSchema.extend({ id: z.uuid() }) }),
  z.object({ action: z.literal('delete'), deviceId: z.uuid(), id: z.uuid() })
]);
export async function POST(request: Request) {
  try {
    const body = input.parse(await readBody(request));
    if (!process.env.DATABASE_URL?.trim()) return Response.json({ enabled: false, cards: [] });
    if (body.action === 'load') return Response.json({ enabled: true, cards: await readBackup(body.deviceId) });
    if (body.action === 'save') await writeBackup(body.deviceId, body.card);
    else await deleteBackup(body.deviceId, body.id);
    return Response.json({ enabled: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof ApiError) return errorResponse(error);
    return errorResponse(new ApiError(503, 'Die Datenbanksicherung ist gerade nicht erreichbar. Deine lokalen Karten bleiben verfügbar.'));
  }
}
