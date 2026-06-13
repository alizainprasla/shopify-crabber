# Shopify Crabber

A Chrome extension that scrapes product data from any ecommerce website and exports Shopify-compatible CSV files. Works on Shopify, WooCommerce, BigCommerce, and generic stores.

---

## Features

### Scraping
- **Auto-detection** — recognises Shopify (JSON API, React Router streaming, window.meta), WooCommerce, BigCommerce, Magento, and generic sites (JSON-LD, Open Graph, DOM fallbacks)
- **shop.app support** — handles React Router v7 streaming with async `productDetailsPromise`
- **Custom selectors** — visually pick any element on the page to override auto-detection per domain
- **Shopify collection scraper** — fetch every product in a collection in one click via the Shopify JSON API (paginated)

### Export
- **Shopify CSV** — fully spec-compliant with all columns, variant rows, image rows, UTF-8 BOM
- **Bulk CSV** — multi-product export from collection scraping
- **Image ZIP** — download all product images as a ZIP file
- **Copy to clipboard** — copy CSV directly without saving a file
- **Push to Shopify** — create a product directly in your own Shopify store via the Admin API

### UI
- **Side panel** — slides in from the right and stays open while you browse (Chrome 114+)
- **DevTools panel** — "Crabber" tab in Chrome DevTools with selector editor and scrape history
- **Visual element picker** — hover to highlight elements, click to capture the CSS selector

---

## Installation

### Load from source

```bash
git clone <repository-url>
cd shopify-crabber
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder

> If the icon is hidden after loading, click the puzzle-piece menu and pin it.

### Development (hot reload)

```bash
npm run dev
```

---

## Usage

### Scraping a single product

1. Navigate to any product page
2. Click the **Shopify Crabber** icon — a side panel slides in from the right
3. Click **Scrape Page**
4. Review the product data (title, vendor, price, variants, images)
5. Click **Download CSV**, **Copy CSV**, or **Download Images**

### Scraping an entire collection

1. Navigate to any Shopify collection page (URL contains `/collections/`)
2. Open the side panel — a **📦 Scrape Entire Collection** button appears automatically
3. Click it — all products are fetched from the Shopify JSON API
4. A preview shows all products with variant and image counts
5. Click **Download CSV** for a bulk Shopify-importable file

### Custom selectors (any website)

Use this when auto-detection misses fields, or on a non-standard site:

1. Open the side panel → click **🎯 Customize Selectors**
2. Click **Pick** next to any field (Title, Price, Description, Images, Vendor)
3. A green outline appears on hover — click any element on the page
4. The CSS selector is captured automatically and fills in the panel
5. You can also type a selector manually (standard CSS syntax)
6. Click **Save Selectors** — the selectors are stored per domain and used automatically on every future scrape

### DevTools panel

1. Open Chrome DevTools (F12) on any product page
2. Click the **Crabber** tab
3. Left sidebar: edit custom selectors and use the element picker
4. Right area: scrape the page and view results with Info / Variants / Images tabs

### Push to Shopify

Connect your own Shopify store to push scraped products directly:

1. Click the **⚙️** settings icon in the side panel
2. Enter your store URL (`your-store.myshopify.com`) and Admin API access token
3. After scraping, click **Push to Shopify**

**Getting an access token:**
- Shopify Admin → Settings → Apps and sales channels → **Develop apps**
- Create a custom app → API credentials → enable `write_products`
- Install the app → copy the token (starts with `shpat_`)

> Credentials are stored locally in `chrome.storage.local` and sent only to your own store.

---

## Project structure

```
src/
├── background/
│   └── index.ts              # Service worker: message routing, collection scraper, Shopify push
├── content/
│   ├── index.ts              # Content script: handles SCRAPE_PRODUCT, START_PICKER
│   └── picker.ts             # Visual element picker overlay
├── devtools/
│   ├── devtools.html/ts      # DevTools entry — registers the Crabber panel
│   ├── panel.html
│   ├── Panel.tsx             # DevTools panel UI
│   └── main.tsx
├── popup/
│   ├── components/
│   │   ├── App.tsx
│   │   ├── CollectionScraper.tsx
│   │   ├── FieldPicker.tsx
│   │   ├── ProductPreview.tsx
│   │   ├── ExportActions.tsx
│   │   ├── StoreConnect.tsx
│   │   └── ...
│   └── styles.css
├── sidepanel/
│   ├── index.html            # Side panel entry (mounts same App)
│   ├── main.tsx
│   └── panel.css             # Overrides popup body constraints
├── types/
│   └── index.ts
└── utils/
    ├── scrapers/
    │   ├── baseScraper.ts
    │   ├── shopifyScraper.ts  # Shopify: JSON API, React Router, Next.js, JSON-LD
    │   ├── genericScraper.ts  # WooCommerce, BigCommerce, JSON-LD, DOM
    │   ├── customScraper.ts   # Runs user-defined selectors first
    │   └── index.ts           # Scraper pipeline (custom → Shopify → generic)
    ├── selector/
    │   └── cssGenerator.ts    # Generates shortest unique CSS selector for any element
    ├── storage/
    │   └── selectorStore.ts   # Load/save SelectorMap per hostname
    ├── shopify/
    │   ├── csvFormatter.ts
    │   └── handleGenerator.ts
    ├── csv/
    │   └── csvGenerator.ts    # Single and multi-product CSV
    └── images/
        └── imageExtractor.ts
```

---

## CSV format

The exported CSV follows the official Shopify product import format:

- **First row per product** — all fields: title, description, vendor, first variant, first image
- **Additional variant rows** — handle + variant data only
- **Additional image rows** — handle + image src/position only

Key columns:

| Column | Description |
|--------|-------------|
| Handle | URL slug (auto-generated from title) |
| Title | Product name |
| Body (HTML) | Description HTML |
| Vendor | Brand/manufacturer |
| Option1–3 Name/Value | Variant options (Size, Color, etc.) |
| Variant SKU | Stock keeping unit |
| Variant Grams | Weight in grams |
| Variant Price | Sale price |
| Variant Compare At Price | Original/crossed-out price |
| Image Src | Full HTTPS image URL |
| Image Position | Image order (1, 2, 3…) |
| Status | active / draft / archived |

---

## Supported platforms

| Platform | Method |
|----------|--------|
| Shopify | `/products/{handle}.json` API, React Router streaming, window.meta, JSON-LD |
| shop.app | React Router v7 `productDetailsPromise` |
| WooCommerce | Schema.org JSON-LD, DOM |
| BigCommerce | JSON-LD, product page structure |
| Magento | JSON-LD, DOM |
| Any site | Custom CSS selectors (user-defined) |

---

## Browser compatibility

- **Chrome 114+** — required for the Side Panel API
- **Chrome 88+** — works without the side panel (load `src/popup/index.html` directly)
- Edge 114+ (Chromium-based)

---

## Troubleshooting

**"No product data found"**
— Make sure you're on a product detail page, not a listing or search page. Try reloading the page before scraping.

**Auto-detection misses fields**
— Use **Customize Selectors** to manually pick the title, price, description, and images. Selectors are saved per domain.

**Collection scraper returns an error**
— The Shopify JSON API (`/collections/{handle}/products.json`) must be publicly accessible. Some stores disable it — in that case, scrape products individually.

**Images not downloading**
— Some stores block cross-origin image requests. The ZIP download fetches images through the extension's `host_permissions`; if individual images fail they are skipped silently.

**CSV import fails in Shopify**
— Ensure image URLs are publicly accessible HTTPS URLs. Check for special characters in product titles. The CSV is UTF-8 with BOM which Excel and Shopify both handle correctly.

**Side panel doesn't open**
— Requires Chrome 114+. After reloading the extension at `chrome://extensions`, click the icon once to register the side panel behaviour.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| React 18 | UI framework |
| Vite + @crxjs/vite-plugin | Build tooling for Chrome extensions |
| PapaParse | CSV generation |
| JSZip | Image ZIP packaging |
| Tailwind CSS | Styling |
| TypeScript | Type safety |
