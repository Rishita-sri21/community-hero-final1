import mongoose from 'mongoose';

// Photos are stored in MongoDB GridFS (bucket "images"), so they live in the same
// database as everything else and survive redeploys. They are served by GET /api/images/:id.

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'images' });
}

type ImageError = 'invalid' | 'unsupported-type' | 'too-large';

export type ParsedImage = { ok: true; contentType: string; data: Buffer } | { ok: false; reason: ImageError };

/** Decodes and checks a base64 data URL (e.g. from a file input or camera) without storing it. */
export function parseDataUrlImage(dataUrl: string): ParsedImage {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return { ok: false, reason: 'invalid' };

  const [, contentType, base64] = match;
  if (!ALLOWED_TYPES.includes(contentType)) return { ok: false, reason: 'unsupported-type' };

  const data = Buffer.from(base64, 'base64');
  if (data.length === 0) return { ok: false, reason: 'invalid' };
  if (data.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'too-large' };
  return { ok: true, contentType, data };
}

/** Stores a checked image and returns its /api/images URL. */
export async function storeImage(image: { contentType: string; data: Buffer }, ownerId: unknown): Promise<string> {
  const upload = bucket().openUploadStream('photo', { metadata: { contentType: image.contentType, ownerId: String(ownerId) } });
  await new Promise<void>((resolve, reject) => {
    upload.once('finish', () => resolve());
    upload.once('error', reject);
    upload.end(image.data);
  });
  return `/api/images/${upload.id}`;
}

export type SaveImageResult = { ok: true; url: string } | { ok: false; reason: ImageError };

export async function saveDataUrlImage(dataUrl: string, ownerId: unknown): Promise<SaveImageResult> {
  const parsed = parseDataUrlImage(dataUrl);
  if (parsed.ok === false) return parsed;
  return { ok: true, url: await storeImage(parsed, ownerId) };
}

/** Finds a stored image, or null if the id is malformed or unknown. */
export async function findImage(id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  const _id = new mongoose.Types.ObjectId(id);
  const [file] = await bucket().find({ _id }).limit(1).toArray();
  if (!file) return null;
  return {
    contentType: (file.metadata?.contentType as string) || 'application/octet-stream',
    length: file.length,
    stream: () => bucket().openDownloadStream(_id),
  };
}

/** Reads back an uploaded photo by its /api/images URL, e.g. to show the AI the "before" photo. */
export async function readStoredImage(url: string): Promise<{ contentType: string; data: Buffer } | null> {
  const id = url.startsWith('/api/images/') ? url.slice('/api/images/'.length) : null;
  const image = id ? await findImage(id) : null;
  if (!image) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of image.stream()) chunks.push(chunk as Buffer);
  return { contentType: image.contentType, data: Buffer.concat(chunks) };
}

/** Deletes an uploaded photo by its /api/images URL. Missing photos are ignored. */
export async function deleteStoredImage(url: string) {
  const id = url.startsWith('/api/images/') ? url.slice('/api/images/'.length) : null;
  if (!id || !mongoose.isValidObjectId(id)) return;
  await bucket().delete(new mongoose.Types.ObjectId(id)).catch(() => {});
}

export function imageErrorMessage(reason: ImageError) {
  if (reason === 'too-large') return `Photos must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller`;
  if (reason === 'unsupported-type') return 'Photos must be JPEG, PNG or WebP';
  return 'The photo could not be read';
}
