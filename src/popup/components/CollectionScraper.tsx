import { useState, useCallback } from 'react';
import type { ScrapedProduct } from '../../types';
import { generateMultiProductCSV } from '../../utils/csv';
import { generateHandle } from '../../utils/shopify';

interface Props {
  tabUrl: string;
  onClose: () => void;
}

type State = 'idle' | 'scraping' | 'done' | 'error';

export function CollectionScraper({ tabUrl, onClose }: Props) {
  const [state, setState] = useState<State>('idle');
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleScrape = useCallback(async () => {
    setState('scraping');
    setError('');
    setProducts([]);

    const response = await chrome.runtime.sendMessage({
      type: 'SCRAPE_COLLECTION',
      payload: { url: tabUrl },
    });

    if (response.success && response.products?.length) {
      // Ensure handles are set
      const normalized: ScrapedProduct[] = response.products.map((p: ScrapedProduct) => ({
        ...p,
        handle: p.handle || generateHandle(p.title),
      }));
      setProducts(normalized);
      setState('done');
    } else {
      setError(response.error || 'No products found');
      setState('error');
    }
  }, [tabUrl]);

  const handleDownloadCSV = useCallback(async () => {
    if (!products.length) return;
    setDownloading(true);
    try {
      const csv = generateMultiProductCSV(products);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const u = new URL(tabUrl);
      const collectionMatch = u.pathname.match(/\/collections\/([^/?#]+)/);
      const slug = collectionMatch?.[1] || 'collection';
      await chrome.downloads.download({
        url,
        filename: `shopify-${slug}-${products.length}products.csv`,
        saveAs: true,
      });
    } finally {
      setDownloading(false);
    }
  }, [products, tabUrl]);

  const handleCopy = useCallback(async () => {
    if (!products.length) return;
    const csv = generateMultiProductCSV(products);
    await navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [products]);

  const collectionName = (() => {
    try {
      const m = new URL(tabUrl).pathname.match(/\/collections\/([^/?#]+)/);
      return m?.[1] ?? 'collection';
    } catch {
      return 'collection';
    }
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Scrape Collection</h2>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{collectionName}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      {state === 'idle' && (
        <>
          <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Fetches all products in this Shopify collection via the JSON API and exports a
            bulk Shopify-importable CSV.
          </p>
          <button onClick={handleScrape} className="w-full btn btn-primary">
            Scrape All Products
          </button>
        </>
      )}

      {state === 'scraping' && (
        <div className="card p-6 text-center">
          <div className="inline-block w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-600 text-sm">Fetching all products…</p>
          <p className="text-xs text-gray-400 mt-1">May take a moment for large collections</p>
        </div>
      )}

      {state === 'error' && (
        <div className="card p-4 border-red-100">
          <p className="text-sm text-red-600 font-medium">Failed</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
          <button onClick={() => setState('idle')} className="mt-3 w-full btn btn-secondary text-sm">
            Try Again
          </button>
        </div>
      )}

      {state === 'done' && (
        <>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold text-sm flex-shrink-0">
                {products.length}
              </div>
              <div>
                <p className="font-medium text-gray-800 text-sm">
                  {products.length} product{products.length !== 1 ? 's' : ''} scraped
                </p>
                <p className="text-xs text-gray-400">
                  {products.reduce((n, p) => n + p.variants.length, 0)} variants ·{' '}
                  {products.reduce((n, p) => n + p.images.length, 0)} images
                </p>
              </div>
            </div>

            {/* Mini product list */}
            <div className="mt-3 space-y-1 max-h-[140px] overflow-y-auto">
              {products.slice(0, 20).map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                  {p.images[0] && (
                    <img
                      src={p.images[0].src}
                      className="w-6 h-6 rounded object-cover border border-gray-200 flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <span className="truncate">{p.title}</span>
                  <span className="text-gray-400 flex-shrink-0">{p.variants[0]?.price ? `$${p.variants[0].price}` : ''}</span>
                </div>
              ))}
              {products.length > 20 && (
                <p className="text-xs text-gray-400 pl-8">+{products.length - 20} more</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownloadCSV}
              disabled={downloading}
              className="flex-1 btn btn-primary text-sm disabled:opacity-50"
            >
              {downloading ? 'Downloading…' : 'Download CSV'}
            </button>
            <button
              onClick={handleCopy}
              className="btn btn-secondary text-sm px-3"
              title="Copy CSV to clipboard"
            >
              {copied ? '✓' : 'Copy'}
            </button>
          </div>

          <button
            onClick={() => { setState('idle'); setProducts([]); }}
            className="w-full btn btn-secondary text-sm"
          >
            Scrape Again
          </button>
        </>
      )}
    </div>
  );
}
