# Shopify Crabber — Roadmap

Inspired by [Web Scraper](https://webscraper.io), this roadmap expands the extension from a
Shopify-specific product scraper into a general-purpose visual web scraper that also outputs
Shopify-ready CSV.

---

## Phase 1 — Visual Element Picker ✦ highest priority

**Goal:** Let users click any element on the page to define what gets scraped, instead of
relying solely on auto-detection.

### What it does
- Toolbar button "Pick element" activates a hover-highlight overlay on the live page
- Hovering shows a blue outline + tooltip with the tag / selector
- Clicking locks the selection and assigns it to a field (Title, Price, Image, Description, …)
- Selector is saved per-domain in `chrome.storage` and reused on every future visit

### Files to create / modify
| File | Change |
|------|--------|
| `src/content/picker.ts` | New — injects overlay, handles hover/click, generates CSS selector |
| `src/utils/selector/cssGenerator.ts` | New — generates shortest unique CSS selector for any DOM node |
| `src/types/index.ts` | Add `SelectorMap`, `FieldDefinition` types |
| `src/popup/components/FieldPicker.tsx` | New — UI listing each field with its current selector + Pick button |
| `src/popup/App.tsx` | Add picker mode toggle |
| `manifest.json` | Add `"tabs"` permission (needed to send picker messages) |

### User flow
1. Open popup → click **"Customize Selectors"**
2. Panel shows: Title, Price, Image, Description each with current auto-detected selector
3. Click **Pick** next to any field → page enters highlight mode
4. Hover elements, click one → selector saved, popup re-opens
5. Scrape now uses saved selectors first, falls back to auto-detection

---

## Phase 2 — Generic Any-Page Scraping

**Goal:** Make the scraper work on any website, not just Shopify/WooCommerce. Custom selectors
defined in Phase 1 drive extraction. The output is still Shopify-importable CSV.

### What it does
- New `CustomScraper` class — uses user-defined `SelectorMap` to extract fields
- If a selector map exists for the current domain, it runs before all other scrapers
- Users can define arbitrary field names (maps to CSV columns)
- "Field type" tells the scraper how to extract: text, href, image src, innerHTML, attribute

### Files to create / modify
| File | Change |
|------|--------|
| `src/utils/scrapers/customScraper.ts` | New — selector-map-driven scraper |
| `src/utils/storage/selectorStore.ts` | New — load/save `SelectorMap` keyed by hostname |
| `src/utils/scrapers/index.ts` | Check `customScraper` before Shopify/Generic |
| `src/popup/components/FieldPicker.tsx` | Add field-type dropdown, custom field creation |

---

## Phase 3 — DevTools Panel

**Goal:** Move the main scraping UI into a DevTools panel (like Web Scraper) for a larger,
richer workspace alongside the browser's inspector.

### What it does
- New DevTools panel tab: **"Crabber"**
- Left sidebar: selector tree showing all defined fields + their CSS selectors
- Main area: live preview of scraped data, edit selectors inline
- Popup becomes a minimal "quick-scrape" shortcut; full config lives in DevTools

### Files to create / modify
| File | Change |
|------|--------|
| `src/devtools/devtools.html` | New — DevTools entry page (loads panel) |
| `src/devtools/panel.html` | New — actual panel HTML |
| `src/devtools/panel.tsx` | New — React panel UI |
| `vite.config.ts` | Add `devtools` and `panel` as build entry points |
| `manifest.json` | Add `"devtools_page": "src/devtools/devtools.html"` |

---

## Phase 4 — Multi-Page / Pagination Scraping

**Goal:** Scrape an entire collection or category page — not just one product — by following
pagination and collecting all matching items.

### What it does
- New "Scrape Collection" mode — user points at a collection/listing URL
- Pagination selector: user picks the "Next page" link once
- Item selector: user picks one product card on the listing page
- Extension opens a background tab, iterates all pages, scrapes each product
- All results merged into a single CSV download

### Files to create / modify
| File | Change |
|------|--------|
| `src/content/crawler.ts` | New — pagination driver, sends products back via messages |
| `src/background/index.ts` | New `CRAWL_COLLECTION` message handler, tab lifecycle management |
| `src/popup/components/CollectionScraper.tsx` | New — UI to configure collection URL + pagination selector |
| `src/utils/csv/csvGenerator.ts` | Support multi-product CSV (already near-ready) |
| `src/types/index.ts` | Add `CrawlConfig`, `CrawlProgress` types |

---

## Current Status

| Phase | Status |
|-------|--------|
| Phase 1 — Visual Picker | 🔲 Not started |
| Phase 2 — Generic Scraping | 🔲 Not started |
| Phase 3 — DevTools Panel | 🔲 Not started |
| Phase 4 — Multi-Page | 🔲 Not started |

---

## Existing Features (working)

- Auto-detect Shopify (JSON endpoint, React Router, Next.js, window.meta)
- Auto-detect WooCommerce / generic via JSON-LD + DOM
- Export Shopify-importable CSV
- Download images as ZIP
- Push product directly to a Shopify store via Admin API
