import { uploadImage } from '@/lib/image-files';
import { errorResponse } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { return Response.json({ imageUrl: await uploadImage(request) }); }
  catch (error) { return errorResponse(error); }
}
