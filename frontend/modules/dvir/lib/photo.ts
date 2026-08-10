// frontend/modules/dvir/lib/photo.ts

export interface CapturedPhoto {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

/**
 * Downscales and re-encodes a captured photo before it ever touches
 * the offline queue -- a full-resolution phone-camera photo (often
 * 3-8MB) would blow through IndexedDB quotas fast if a driver queues
 * several defects while offline, and doesn't need to be that large for
 * a workshop to see what's wrong.
 */
export function captureFileToBase64(file: File): Promise<CapturedPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read photo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode photo'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas is not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve({ base64, mimeType: 'image/jpeg', previewUrl: dataUrl });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
