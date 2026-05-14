// Client-side only. Do not import from server components or API routes.

const MAX_DIMENSION = 1200; // max px on longest side
const JPEG_QUALITY = 0.85;
const SKIP_THRESHOLD_BYTES = 500 * 1024; // skip compression for files already under 500 KB

/**
 * Resizes and recompresses a JPEG or PNG to at most MAX_DIMENSION px on the
 * longest side at JPEG_QUALITY. Returns the original file unchanged if the
 * file is already small, if the canvas is unavailable, or if compression
 * produces a larger result than the original.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.size <= SKIP_THRESHOLD_BYTES) return file;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name, { type: 'image/jpeg' });
          resolve(compressed.size < file.size ? compressed : file);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
