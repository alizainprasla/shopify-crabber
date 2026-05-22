# Shopify Crabber

A production-ready Chrome Extension (Manifest V3) that scrapes product data from ecommerce websites and generates Shopify-compatible CSV files for import.

## Features

- **Smart Scraping**: Automatically detects and extracts product data from:
  - Shopify stores (using JSON endpoints, JSON-LD, window.Shopify)
  - WooCommerce, BigCommerce, Magento stores
  - Any generic ecommerce site (using Schema.org markup, Open Graph, DOM)

- **Shopify CSV Export**: Generates fully compatible CSV files with:
  - All required Shopify columns
  - Proper variant handling (separate rows per variant)
  - Image import rules (multiple images as separate rows)
  - UTF-8 encoding with BOM
  - Proper escaping and formatting

- **Image Support**:
  - Extracts all product and variant images
  - Downloads images as ZIP file
  - Converts relative URLs to absolute HTTPS URLs
  - Removes duplicates automatically

- **Variant Support**:
  - Extracts Size, Color, Material, Style options
  - Supports up to 3 option types (Shopify limit)
  - Generates proper Option1/Option2/Option3 columns

- **Validation**:
  - Validates product data before export
  - Warns about missing required fields
  - Validates image URLs
  - Checks for duplicate variants

## Installation

### Development

1. Clone the repository:
```bash
git clone <repository-url>
cd shopify-crabber
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Load in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder

### Development Mode

For development with hot reload:
```bash
npm run dev
```

## Usage

1. Navigate to any ecommerce product page
2. Click the Shopify Crabber extension icon
3. Click "Scrape Current Product"
4. Review the extracted data in the preview
5. Click "Download Shopify CSV" to export
6. Optionally download product images as ZIP

## CSV Format

The generated CSV follows the official Shopify product import format:

| Column | Description |
|--------|-------------|
| Handle | SEO-friendly URL slug |
| Title | Product name |
| Body (HTML) | Product description |
| Vendor | Brand/manufacturer |
| Product Category | Shopify product taxonomy |
| Type | Product type/category |
| Tags | Comma-separated tags |
| Published | TRUE/FALSE |
| Option1 Name | First option name (e.g., Size) |
| Option1 Value | First option value (e.g., Medium) |
| Option2 Name | Second option name |
| Option2 Value | Second option value |
| Option3 Name | Third option name |
| Option3 Value | Third option value |
| Variant SKU | Stock keeping unit |
| Variant Grams | Weight in grams |
| Variant Inventory Qty | Stock quantity |
| Variant Price | Sale price |
| Variant Compare At Price | Original price |
| Image Src | Image URL (HTTPS) |
| Image Position | Image order (1, 2, 3...) |
| Image Alt Text | Image alt text |
| SEO Title | Meta title |
| SEO Description | Meta description |
| Status | active/draft/archived |

### Multi-Row Format

Shopify CSV requires specific row structure:

1. **First row**: Contains all product info + first variant + first image
2. **Variant rows**: Additional variants with Handle + variant data only
3. **Image rows**: Additional images with Handle + Image fields only

Example:
```csv
Handle,Title,Variant SKU,Image Src,Image Position
my-product,My Product,SKU-001,https://example.com/img1.jpg,1
my-product,,,https://example.com/img2.jpg,2
my-product,,SKU-002,,
```

## Project Structure

```
shopify-crabber/
├── src/
│   ├── background/          # Service worker
│   │   └── index.ts
│   ├── content/             # Content scripts
│   │   └── index.ts
│   ├── popup/               # React popup UI
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── ScrapeButton.tsx
│   │   │   ├── ProductPreview.tsx
│   │   │   ├── ExportActions.tsx
│   │   │   ├── ValidationWarnings.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── ErrorMessage.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   └── utils/
│       ├── shopify/         # Shopify formatting
│       │   ├── handleGenerator.ts
│       │   └── csvFormatter.ts
│       ├── scrapers/        # Product scrapers
│       │   ├── baseScraper.ts
│       │   ├── shopifyScraper.ts
│       │   └── genericScraper.ts
│       ├── csv/             # CSV generation
│       │   └── csvGenerator.ts
│       ├── validators/      # Data validation
│       │   └── productValidator.ts
│       └── images/          # Image handling
│           └── imageExtractor.ts
├── icons/                   # Extension icons
├── manifest.json            # Chrome extension manifest
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Supported Platforms

### Full Support
- **Shopify**: Uses native product JSON, JSON-LD, and DOM scraping
- **WooCommerce**: Extracts from Schema.org markup and DOM
- **BigCommerce**: Uses JSON-LD and product page structure

### Generic Support
Any ecommerce site with:
- Schema.org Product markup
- Open Graph product tags
- Standard product page structure

## Handle Generation

Handles are generated following Shopify's rules:
- Lowercase letters only
- Hyphens instead of spaces
- No special characters
- No consecutive hyphens
- Max 200 characters

Example: `"Men's Black T-Shirt XL"` → `"mens-black-t-shirt-xl"`

## API Reference

### Types

```typescript
interface ScrapedProduct {
  title: string;
  handle?: string;
  description?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  variants: ProductVariant[];
  images: ProductImage[];
  seoTitle?: string;
  seoDescription?: string;
  sourceUrl: string;
  platform?: string;
}

interface ProductVariant {
  sku?: string;
  barcode?: string;
  price: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  weight?: number;
  weightUnit?: 'g' | 'kg' | 'oz' | 'lb';
  options: VariantOption[];
  imageUrl?: string;
}

interface ProductImage {
  src: string;
  alt?: string;
  position?: number;
}
```

## Troubleshooting

### "No product data found"
- Make sure you're on a product page (not category/search)
- Check if the page uses JavaScript rendering
- Try refreshing the page and scraping again

### Images not downloading
- Some sites block cross-origin image requests
- Try right-clicking images to verify they're accessible
- Check browser console for CORS errors

### CSV import fails in Shopify
- Verify the CSV encoding (should be UTF-8 with BOM)
- Check for special characters in product data
- Ensure image URLs are publicly accessible HTTPS URLs

## Dependencies

- **React 18**: Popup UI framework
- **Vite**: Build tool
- **PapaParse**: CSV parsing and generation
- **JSZip**: Image ZIP packaging
- **FileSaver.js**: File downloads
- **Tailwind CSS**: Styling

## Browser Compatibility

- Chrome 88+ (Manifest V3 support)
- Edge 88+ (Chromium-based)

## Example Output

### Sample Scraped Product

```json
{
  "title": "Classic Cotton T-Shirt",
  "handle": "classic-cotton-t-shirt",
  "description": "A comfortable everyday cotton t-shirt",
  "vendor": "BrandName",
  "productType": "T-Shirts",
  "tags": ["cotton", "casual", "basics"],
  "variants": [
    {
      "sku": "SHIRT-S-BLK",
      "price": "29.99",
      "compareAtPrice": "39.99",
      "options": [
        { "name": "Size", "value": "Small" },
        { "name": "Color", "value": "Black" }
      ]
    }
  ],
  "images": [
    { "src": "https://cdn.example.com/shirt-front.jpg", "position": 1 },
    { "src": "https://cdn.example.com/shirt-back.jpg", "position": 2 }
  ]
}
```

### Generated CSV

```csv
Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Price,Variant Compare At Price,Image Src,Image Position,Status
"classic-cotton-t-shirt","Classic Cotton T-Shirt","A comfortable everyday cotton t-shirt","BrandName","T-Shirts","cotton, casual, basics","TRUE","Size","Small","Color","Black","SHIRT-S-BLK","29.99","39.99","https://cdn.example.com/shirt-front.jpg","1","active"
"classic-cotton-t-shirt","","","","","","","","","","","","","","https://cdn.example.com/shirt-back.jpg","2",""
```

## License

MIT License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Icons

The extension requires icons in the `icons/` directory:
- `icon16.png` (16x16)
- `icon32.png` (32x32)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

You can generate these from any square image using tools like:
- [favicon.io](https://favicon.io/)
- [realfavicongenerator.net](https://realfavicongenerator.net/)
