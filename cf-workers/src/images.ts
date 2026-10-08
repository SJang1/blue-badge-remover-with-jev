export interface ClefImage { content_type: 'image/png' | 'image/jpeg' | 'image/webp'; base64: string }
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;

export function parseImages(value: unknown): ClefImage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) throw new Error('images must be an array of at most 4 embedded images');
  let totalBytes = 0;
  return value.map((image: unknown) => {
    if (!image || typeof image !== 'object' || !('content_type' in image) || !('base64' in image)
      || (image.content_type !== 'image/png' && image.content_type !== 'image/jpeg' && image.content_type !== 'image/webp')
      || typeof image.base64 !== 'string' || !image.base64.length
      || image.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || image.base64.length % 4 !== 0
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)) throw new Error('Invalid embedded image');
    const padding = image.base64.endsWith('==') ? 2 : image.base64.endsWith('=') ? 1 : 0;
    const bytes = image.base64.length / 4 * 3 - padding;
    totalBytes += bytes;
    if (bytes > MAX_IMAGE_BYTES || totalBytes > MAX_TOTAL_IMAGE_BYTES) throw new Error('Images exceed the 4 MiB per-image or 8 MiB total limit');
    return { content_type: image.content_type, base64: image.base64 };
  });
}
