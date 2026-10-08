// CLEF 호출에서 Base64가 토큰 한도에 잡히는 경우를 피하고 본문/context 공간을 남긴다.
const MAX_IMAGE_BYTES = 128 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 8192;
const GAP = 8;

async function decodeImages(images: Blob[]): Promise<ImageBitmap[]> {
  const results = await Promise.allSettled(images.map((image) => createImageBitmap(image)));
  const bitmaps = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  const failure = results.find((result) => result.status === 'rejected');
  const oversized = bitmaps.find((bitmap) => bitmap.width * bitmap.height > MAX_IMAGE_PIXELS);
  if (failure || oversized) {
    const dimensions = oversized ? `${oversized.width}×${oversized.height}` : '';
    bitmaps.forEach((bitmap) => bitmap.close());
    if (failure) throw new Error('Could not decode tweet image', { cause: failure.reason });
    throw new Error(`Tweet image exceeds 16 megapixels (${dimensions})`);
  }
  return bitmaps;
}

function drawImages(bitmaps: ImageBitmap[]): OffscreenCanvas {
  const width = Math.min(MAX_WIDTH, Math.max(...bitmaps.map((bitmap) => bitmap.width)));
  const heights = bitmaps.map((bitmap) => bitmap.height * Math.min(1, width / bitmap.width));
  const height = heights.reduce((total, value) => total + value, 0) + GAP * (bitmaps.length - 1);
  const scale = Math.min(1, MAX_HEIGHT / height, Math.sqrt(MAX_IMAGE_PIXELS / (width * height)));
  const canvas = new OffscreenCanvas(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)));
  const fittedScale = Math.min(canvas.width / width, canvas.height / height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not compose tweet images');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (const bitmap of bitmaps) {
    const targetWidth = Math.min(bitmap.width, width) * fittedScale;
    const targetHeight = bitmap.height * targetWidth / bitmap.width;
    context.drawImage(bitmap, (canvas.width - targetWidth) / 2, y, targetWidth, targetHeight);
    y += targetHeight + GAP * fittedScale;
  }
  return canvas;
}

function shrinkCanvas(canvas: OffscreenCanvas): OffscreenCanvas {
  const smaller = new OffscreenCanvas(Math.max(1, Math.floor(canvas.width * 0.8)), Math.max(1, Math.floor(canvas.height * 0.8)));
  const context = smaller.getContext('2d');
  if (!context) throw new Error('Could not resize composed tweet image');
  context.drawImage(canvas, 0, 0, smaller.width, smaller.height);
  canvas.width = canvas.height = 1;
  return smaller;
}

async function encodeCanvas(original: OffscreenCanvas): Promise<Blob> {
  let canvas = original;
  try {
    const lossless = await canvas.convertToBlob({ type: 'image/png' });
    if (lossless.size <= MAX_IMAGE_BYTES) return lossless;
    for (let attempt = 0; attempt < 12; attempt++) {
      for (const quality of [0.92, 0.8]) {
        const image = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        if (image.size <= MAX_IMAGE_BYTES) return image;
      }
      canvas = shrinkCanvas(canvas);
    }
    throw new Error('Encoded tweet image exceeds the 128 KiB inference budget');
  } finally { canvas.width = canvas.height = 1; }
}

export async function composeTweetImages(images: Blob[]): Promise<Blob> {
  const bitmaps = await decodeImages(images);
  try {
    if (images.length === 1 && images[0]!.size <= MAX_IMAGE_BYTES) return images[0]!;
    // DOM 순서대로 위에서 아래로 배치하며, 만화·스크린샷의 내용을 자르지 않는다.
    return await encodeCanvas(drawImages(bitmaps));
  } finally { bitmaps.forEach((bitmap) => bitmap.close()); }
}
