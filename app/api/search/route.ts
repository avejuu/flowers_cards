import { z } from 'zod';
import { identitySchema, nameInput, resolutionSchema } from '@/lib/schemas';
import { ApiError, errorResponse, gemini, readBody } from '@/lib/server';
import { imageProvider } from '@/lib/image-provider';
export async function POST(request: Request) {
  try {
    const { name, skipImages } = z.object({ name: nameInput, skipImages: z.boolean().optional() }).parse(await readBody(request));
    const identity = await gemini(`Bestimme die reale Pflanze zum deutschen oder botanischen Namen ${JSON.stringify(name)}. Gib den üblichen deutschen und englischen Namen sowie wenn bekannt den botanischen Namen zurück (sonst latinName leer). Akzeptiere reale Pflanzen einschließlich Schnittblumen, blühender Zimmerpflanzen, Zierpflanzen, Gartenblumen, Floristik-Grün und dekorativer Blätter. Auch Gattungsnamen und gebräuchliche Namen sind gültig; eine genaue Art ist nicht erforderlich. Rose, Tulpe, Orchidee, Einblatt (Peace lily, Spathiphyllum), Spathiphyllum, Anthurie, Hortensie, Lavendel, Geranie, Eukalyptus, Schleierkraut, Monstera, Sonnenblume, Chrysantheme, Nelke, Lilie, Pfingstrose, Freesie und Ranunkel sind gültige Pflanzen, auch wenn sie keine typischen Schnittblumen sind. Setze isValidPlant nur bei eindeutig ungültigen Eingaben oder Nicht-Pflanzen auf false. Erfinde keine Arten.`, resolutionSchema);
    if (!identity.isValidPlant) throw new ApiError(422, 'Dieser Pflanzenname wurde nicht erkannt. Bitte gib den Namen einer realen Pflanze ein.');
    const plant = identitySchema.safeParse(identity);
    if (!plant.success) throw new ApiError(502, 'Gemini hat keine vollständigen Pflanzennamen geliefert. Bitte versuche es erneut.');
    return Response.json({ identity: plant.data, ...(skipImages ? { photos: [], usedQuery: '' } : await imageProvider.search(plant.data)) });
  } catch (error) { return errorResponse(error); }
}
