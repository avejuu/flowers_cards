import { z } from 'zod';
import { generatedSchema, identitySchema, infoSchema } from '@/lib/schemas';
import { errorResponse, gemini, readBody } from '@/lib/server';
const input = z.discriminatedUnion('action', [z.object({ action: z.literal('generate'), identity: identitySchema }), z.object({ action: z.literal('verify'), identity: identitySchema, info: infoSchema })]);
export async function POST(request: Request) {
  try {
    const body = input.parse(await readBody(request));
    const task = body.action === 'verify'
      ? `Prüfe die folgenden vier Angaben auf offensichtliche sachliche Fehler und Widersprüche. Korrigiere nur wenn nötig, behalte richtige Angaben bei. Gib die vollständigen vier Felder auf Deutsch zurück. Vorhandene Angaben: ${JSON.stringify(body.info)}`
      : 'Erstelle die vier kurzen Angaben auf Deutsch: haltbarkeit (Vasendauer bei Schnittblumen/geschnittenem Grün, sonst Blütezeit oder Lebensdauer als Topfpflanze), kombiniertMit (passende Pflanzen oder Blumen), verarbeitung (praktische Vorbereitung), verwendung (floristische Verwendung). Bei ungeeigneten Schnittblumen benenne dies deutlich. Keine langen Erklärungen.';
    const info = await gemini(`${task}\nPflanze: ${JSON.stringify(body.identity)}. Gib auch germanName, englishName und latinName unverändert zurück.`, generatedSchema);
    return Response.json({ ...info, ...body.identity });
  } catch (error) { return errorResponse(error); }
}
