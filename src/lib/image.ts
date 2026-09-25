/** Build a data URL from base64 image data */
export function buildImageSrc(mediaType: string, data?: string, url?: string): string {
  if (url) return url;
  if (data) return `data:${mediaType};base64,${data}`;
  return '';
}

/** Markdown is model-controlled. Only let it resolve images from this app. */
export function safeMarkdownImageSrc(src: string, appOrigin: string): string {
  const value = src.trim();
  if (!value) return '';
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(value)) return value;
  try {
    const base = new URL(appOrigin);
    const parsed = new URL(value, base);
    if (parsed.protocol === 'blob:' && parsed.origin === base.origin) return value;
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === base.origin) {
      return value;
    }
  } catch {
    return '';
  }
  return '';
}
