/**
 * Shopify Handle Generator
 * Generates SEO-friendly handles following Shopify's format
 */

/**
 * Generate a Shopify-compatible handle from a product title
 * Rules:
 * - Lowercase
 * - Hyphen-separated
 * - No spaces
 * - Remove special characters
 * - No leading/trailing hyphens
 * - No consecutive hyphens
 */
export function generateHandle(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }

  return title
    // Convert to lowercase
    .toLowerCase()
    // Replace accented characters with ASCII equivalents
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace & with 'and'
    .replace(/&/g, 'and')
    // Replace apostrophes and quotes (don't add hyphen)
    .replace(/[''"`]/g, '')
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove all non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Replace multiple consecutive hyphens with single hyphen
    .replace(/-+/g, '-')
    // Remove leading hyphens
    .replace(/^-+/, '')
    // Remove trailing hyphens
    .replace(/-+$/, '')
    // Limit length (Shopify handles can be up to 255 chars, but shorter is better)
    .slice(0, 200);
}

/**
 * Generate a unique handle by appending a number if needed
 */
export function generateUniqueHandle(
  title: string,
  existingHandles: Set<string>
): string {
  const baseHandle = generateHandle(title);

  if (!existingHandles.has(baseHandle)) {
    return baseHandle;
  }

  let counter = 1;
  let uniqueHandle = `${baseHandle}-${counter}`;

  while (existingHandles.has(uniqueHandle)) {
    counter++;
    uniqueHandle = `${baseHandle}-${counter}`;
  }

  return uniqueHandle;
}

/**
 * Validate a handle string
 */
export function isValidHandle(handle: string): boolean {
  if (!handle || typeof handle !== 'string') {
    return false;
  }

  // Must be lowercase
  if (handle !== handle.toLowerCase()) {
    return false;
  }

  // Must only contain alphanumeric characters and hyphens
  if (!/^[a-z0-9-]+$/.test(handle)) {
    return false;
  }

  // Must not start or end with hyphen
  if (handle.startsWith('-') || handle.endsWith('-')) {
    return false;
  }

  // Must not have consecutive hyphens
  if (handle.includes('--')) {
    return false;
  }

  return true;
}

/**
 * Clean and fix a potentially invalid handle
 */
export function sanitizeHandle(handle: string): string {
  return generateHandle(handle);
}
