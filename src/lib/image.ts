// Phone photos are often 5–10 MB. Before uploading, shrink them to at most `maxSize`
// pixels on the longest side and re-encode as JPEG, which usually lands at 200–500 KB.
export async function photoToDataUrl(file: File, maxSize = 1600, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', quality);
}
