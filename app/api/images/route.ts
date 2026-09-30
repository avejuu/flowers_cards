import { z } from 'zod';
import { downloadableImageUrl } from '@/lib/schemas';
import { errorResponse, readBody } from '@/lib/server';
import { downloadImage } from '@/lib/image-files';
export const runtime = 'nodejs';
export async function POST(request: Request) { try { const { imageUrl } = z.object({ imageUrl: downloadableImageUrl }).parse(await readBody(request)); return Response.json({ imageUrl: await downloadImage(imageUrl) }); } catch (error) { return errorResponse(error); } }
