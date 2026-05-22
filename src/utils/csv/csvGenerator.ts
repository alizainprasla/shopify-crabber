/**
 * CSV Generator
 * Uses PapaParse to generate properly formatted CSV files
 */

import Papa from 'papaparse';
import type { ScrapedProduct, ShopifyCSVRow } from '../../types';
import { productToShopifyRows, getCSVHeaders } from '../shopify/csvFormatter';

/**
 * Generate CSV string from Shopify rows
 */
export function generateCSV(rows: ShopifyCSVRow[]): string {
  const headers = getCSVHeaders();

  // Convert rows to array of arrays for PapaParse
  const data = rows.map(row => {
    const rowRecord = row as unknown as Record<string, string>;
    return headers.map(header => rowRecord[header] || '');
  });

  // Use PapaParse to generate CSV with proper escaping
  const csv = Papa.unparse({
    fields: headers,
    data: data,
  }, {
    quotes: true, // Always quote fields
    quoteChar: '"',
    escapeChar: '"',
    delimiter: ',',
    newline: '\n',
  });

  // Add BOM for UTF-8 encoding (helps Excel recognize UTF-8)
  const BOM = '\uFEFF';
  return BOM + csv;
}

/**
 * Generate CSV from a single product
 */
export function generateProductCSV(product: ScrapedProduct): string {
  const rows = productToShopifyRows(product);
  return generateCSV(rows);
}

/**
 * Generate CSV from multiple products
 */
export function generateMultiProductCSV(products: ScrapedProduct[]): string {
  const allRows: ShopifyCSVRow[] = [];

  for (const product of products) {
    allRows.push(...productToShopifyRows(product));
  }

  return generateCSV(allRows);
}

/**
 * Create a downloadable CSV blob
 */
export function createCSVBlob(csvString: string): Blob {
  return new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Generate filename for CSV download
 */
export function generateCSVFilename(product?: ScrapedProduct): string {
  const timestamp = new Date().toISOString().split('T')[0];

  if (product) {
    const handle = product.handle || product.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 50);
    return `shopify-import-${handle}-${timestamp}.csv`;
  }

  return `shopify-import-${timestamp}.csv`;
}

/**
 * Parse a CSV string (for validation or preview)
 */
export function parseCSV(csvString: string): {
  headers: string[];
  rows: string[][];
  errors: string[];
} {
  const result = Papa.parse<string[]>(csvString, {
    skipEmptyLines: true,
  });

  const errors = result.errors.map(err => `Row ${err.row}: ${err.message}`);

  if (result.data.length === 0) {
    return { headers: [], rows: [], errors };
  }

  const [headers, ...rows] = result.data;
  return { headers, rows, errors };
}

/**
 * Validate CSV against Shopify requirements
 */
export function validateShopifyCSV(csvString: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { headers, rows, errors: parseErrors } = parseCSV(csvString);

  if (parseErrors.length > 0) {
    errors.push(...parseErrors);
  }

  // Check required headers
  const requiredHeaders = ['Handle', 'Title'];
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      errors.push(`Missing required header: ${required}`);
    }
  }

  // Check for empty handles
  const handleIndex = headers.indexOf('Handle');
  if (handleIndex !== -1) {
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i][handleIndex]) {
        errors.push(`Row ${i + 2}: Missing Handle value`);
      }
    }
  }

  // Check for title on first product row
  const titleIndex = headers.indexOf('Title');
  if (titleIndex !== -1 && rows.length > 0) {
    if (!rows[0][titleIndex]) {
      warnings.push('First row is missing Title - this may cause import issues');
    }
  }

  // Check image URLs
  const imageSrcIndex = headers.indexOf('Image Src');
  if (imageSrcIndex !== -1) {
    for (let i = 0; i < rows.length; i++) {
      const imageUrl = rows[i][imageSrcIndex];
      if (imageUrl) {
        if (!imageUrl.startsWith('https://')) {
          warnings.push(`Row ${i + 2}: Image URL should use HTTPS: ${imageUrl.slice(0, 50)}...`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
