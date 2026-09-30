import { z } from 'zod';
import { providerUrl } from '@/lib/schemas';
import { errorResponse, readBody } from '@/lib/server';
import { downloadImage } from '@/lib/image-files';
export async function POST(request: Request) { try { const { imageUrl } = z.object({ imageUrl: providerUrl('pixabay.com') }).parse(await readBody(request)); return Response.json({ imageUrl: await downloadImage(imageUrl) }); } catch (error) { return errorResponse(error); } }
