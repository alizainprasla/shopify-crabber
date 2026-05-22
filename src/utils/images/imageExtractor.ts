/**
 * Image Extraction Utilities
 * Handles image URL normalization, downloading, and packaging
 */

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { ScrapedProduct } from '../../types';

/**
 * Download a single image as a blob
 */
export async function downloadImage(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      console.warn(`Failed to download image: ${url}`);
      return null;
    }

    return await response.blob();
  } catch (error) {
    console.warn(`Error downloading image: ${url}`, error);
    return null;
  }
}

/**
 * Get file extension from URL or content type
 */
export function getImageExtension(url: string, contentType?: string): string {
  // Try to get from content type
  if (contentType) {
    const match = contentType.match(/image\/(\w+)/);
    if (match) {
      const ext = match[1].toLowerCase();
      if (ext === 'jpeg') return 'jpg';
      return ext;
    }
  }

  // Try to get from URL
  const urlPath = new URL(url).pathname;
  const match = urlPath.match(/\.(\w+)$/);
  if (match) {
    const ext = match[1].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  }

  // Default to jpg
  return 'jpg';
}

/**
 * Generate a filename for an image
 */
export function generateImageFilename(
  handle: string,
  index: number,
  extension: string,
  isVariant: boolean = false
): string {
  const prefix = isVariant ? 'variant' : 'image';
  return `${handle}-${prefix}-${String(index + 1).padStart(2, '0')}.${extension}`;
}

/**
 * Download all product images and package as ZIP
 */
export async function downloadImagesAsZip(
  product: ScrapedProduct,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const handle = product.handle || product.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const allImages: Array<{ url: string; isVariant: boolean }> = [];

  // Collect all image URLs
  product.images.forEach(img => {
    allImages.push({ url: img.src, isVariant: false });
  });

  // Add variant images
  product.variants.forEach(variant => {
    if (variant.imageUrl && !allImages.some(img => img.url === variant.imageUrl)) {
      allImages.push({ url: variant.imageUrl, isVariant: true });
    }
  });

  const total = allImages.length;
  let downloaded = 0;

  // Download each image
  for (let i = 0; i < allImages.length; i++) {
    const { url, isVariant } = allImages[i];

    const blob = await downloadImage(url);
    if (blob) {
      const extension = getImageExtension(url, blob.type);
      const filename = generateImageFilename(handle, i, extension, isVariant);
      zip.file(filename, blob);
    }

    downloaded++;
    if (onProgress) {
      onProgress(downloaded, total);
    }
  }

  // Generate and save ZIP
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const zipFilename = `${handle}-images.zip`;
  saveAs(zipBlob, zipFilename);
}

/**
 * Validate image URL
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Must be HTTP or HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Check for common image extensions or CDN patterns
    const path = parsed.pathname.toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'];
    const hasImageExtension = imageExtensions.some(ext => path.endsWith(ext));

    // Also allow CDN URLs without extensions
    const cdnPatterns = ['cdn.shopify', 'cloudinary', 'imgix', 'cloudflare', 'fastly'];
    const isCdnUrl = cdnPatterns.some(pattern => parsed.host.includes(pattern));

    return hasImageExtension || isCdnUrl || path.includes('/images/');
  } catch {
    return false;
  }
}

/**
 * Get optimized image URL (remove unnecessary params, get larger size)
 */
export function optimizeImageUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Shopify CDN optimizations
    if (parsed.host.includes('cdn.shopify')) {
      // Remove size restrictions to get original
      const path = parsed.pathname.replace(/_\d+x\d*|\d*x\d+/g, '');
      parsed.pathname = path;
    }

    // Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));

    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Extract all unique image URLs from a product
 */
export function extractAllImageUrls(product: ScrapedProduct): string[] {
  const urls = new Set<string>();

  // Product images
  product.images.forEach(img => {
    if (img.src) urls.add(img.src);
  });

  // Variant images
  product.variants.forEach(variant => {
    if (variant.imageUrl) urls.add(variant.imageUrl);
  });

  return Array.from(urls);
}

/**
 * Calculate total size of images (estimate)
 */
export async function estimateImageSize(urls: string[]): Promise<number> {
  let totalSize = 0;

  for (const url of urls) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        totalSize += parseInt(contentLength, 10);
      }
    } catch {
      // Assume 500KB per image if we can't get size
      totalSize += 500 * 1024;
    }
  }

  return totalSize;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
