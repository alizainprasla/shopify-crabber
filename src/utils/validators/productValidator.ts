/**
 * Product Validator
 * Validates scraped product data before CSV export
 */

import type { ScrapedProduct, ValidationResult, ValidationError, ValidationWarning } from '../../types';
import { isValidHandle } from '../shopify/handleGenerator';
import { isValidImageUrl } from '../images/imageExtractor';

/**
 * Validate a scraped product for Shopify import
 */
export function validateProduct(product: ScrapedProduct): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required: Title
  if (!product.title || product.title.trim() === '') {
    errors.push({
      field: 'title',
      message: 'Product title is required',
      severity: 'error',
    });
  } else if (product.title.length > 255) {
    warnings.push({
      field: 'title',
      message: 'Product title is very long and may be truncated',
      severity: 'warning',
    });
  }

  // Handle validation
  if (product.handle && !isValidHandle(product.handle)) {
    warnings.push({
      field: 'handle',
      message: 'Handle contains invalid characters and will be regenerated',
      severity: 'warning',
    });
  }

  // Validate variants
  if (!product.variants || product.variants.length === 0) {
    warnings.push({
      field: 'variants',
      message: 'No variants found - a default variant will be created',
      severity: 'warning',
    });
  } else {
    // Check for duplicate variant options
    const optionCombinations = new Set<string>();
    let hasDuplicates = false;

    for (const variant of product.variants) {
      // Validate price
      if (variant.price && isNaN(parseFloat(variant.price))) {
        errors.push({
          field: 'variant.price',
          message: `Invalid price format: ${variant.price}`,
          severity: 'error',
        });
      }

      // Check for negative prices
      if (variant.price && parseFloat(variant.price) < 0) {
        errors.push({
          field: 'variant.price',
          message: 'Price cannot be negative',
          severity: 'error',
        });
      }

      // Check for duplicate combinations
      const optionKey = variant.options
        .map(o => `${o.name}:${o.value}`)
        .sort()
        .join('|');

      if (optionCombinations.has(optionKey)) {
        hasDuplicates = true;
      } else {
        optionCombinations.add(optionKey);
      }

      // Validate variant image
      if (variant.imageUrl && !isValidImageUrl(variant.imageUrl)) {
        warnings.push({
          field: 'variant.imageUrl',
          message: `Invalid variant image URL: ${variant.imageUrl}`,
          severity: 'warning',
        });
      }
    }

    if (hasDuplicates) {
      warnings.push({
        field: 'variants',
        message: 'Duplicate variant option combinations detected',
        severity: 'warning',
      });
    }

    // Check option count (Shopify supports max 3)
    const allOptionNames = new Set<string>();
    for (const variant of product.variants) {
      for (const option of variant.options || []) {
        allOptionNames.add(option.name);
      }
    }

    if (allOptionNames.size > 3) {
      warnings.push({
        field: 'options',
        message: 'More than 3 option types found - only first 3 will be used',
        severity: 'warning',
      });
    }
  }

  // Validate images
  if (!product.images || product.images.length === 0) {
    warnings.push({
      field: 'images',
      message: 'No product images found',
      severity: 'warning',
    });
  } else {
    for (const image of product.images) {
      if (!isValidImageUrl(image.src)) {
        warnings.push({
          field: 'image.src',
          message: `Invalid or inaccessible image URL: ${image.src.slice(0, 50)}...`,
          severity: 'warning',
        });
      }

      // Check for HTTP (not HTTPS)
      if (image.src.startsWith('http://')) {
        warnings.push({
          field: 'image.src',
          message: 'Image URL uses HTTP - will be converted to HTTPS',
          severity: 'warning',
        });
      }
    }
  }

  // Validate description
  if (!product.description && !product.descriptionHtml) {
    warnings.push({
      field: 'description',
      message: 'No product description found',
      severity: 'warning',
    });
  }

  // Validate vendor
  if (!product.vendor) {
    warnings.push({
      field: 'vendor',
      message: 'No vendor/brand found',
      severity: 'warning',
    });
  }

  // Validate tags
  if (product.tags && product.tags.length > 250) {
    warnings.push({
      field: 'tags',
      message: 'Too many tags - Shopify has a limit of 250 tags per product',
      severity: 'warning',
    });
  }

  // SEO validation
  if (product.seoTitle && product.seoTitle.length > 70) {
    warnings.push({
      field: 'seoTitle',
      message: 'SEO title exceeds recommended 70 characters',
      severity: 'warning',
    });
  }

  if (product.seoDescription && product.seoDescription.length > 160) {
    warnings.push({
      field: 'seoDescription',
      message: 'SEO description exceeds recommended 160 characters',
      severity: 'warning',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick check if product has minimum required data
 */
export function hasMinimumData(product: ScrapedProduct): boolean {
  return Boolean(product.title && product.title.trim());
}

/**
 * Get a summary of validation issues
 */
export function getValidationSummary(result: ValidationResult): string {
  const parts: string[] = [];

  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} error(s)`);
  }

  if (result.warnings.length > 0) {
    parts.push(`${result.warnings.length} warning(s)`);
  }

  if (parts.length === 0) {
    return 'Product data is valid';
  }

  return parts.join(', ');
}

/**
 * Validate CSV content structure
 */
export function validateCSVStructure(csvContent: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!csvContent || csvContent.trim() === '') {
    errors.push({
      field: 'csv',
      message: 'CSV content is empty',
      severity: 'error',
    });
    return { isValid: false, errors, warnings };
  }

  const lines = csvContent.split('\n');

  if (lines.length < 2) {
    errors.push({
      field: 'csv',
      message: 'CSV must have at least a header row and one data row',
      severity: 'error',
    });
    return { isValid: false, errors, warnings };
  }

  // Check header row
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

  const requiredHeaders = ['Handle', 'Title'];
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      errors.push({
        field: 'headers',
        message: `Missing required header: ${required}`,
        severity: 'error',
      });
    }
  }

  // Check for proper UTF-8 BOM
  if (!csvContent.startsWith('\uFEFF')) {
    warnings.push({
      field: 'encoding',
      message: 'CSV does not have UTF-8 BOM - may cause encoding issues in Excel',
      severity: 'warning',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
