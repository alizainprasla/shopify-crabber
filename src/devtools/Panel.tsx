import { useState, useEffect, useCallback } from 'react';
import type { ScrapedProduct, ScrapeResult } from '../types';
import type { SelectorMap, FieldDefinition } from '../utils/storage/selectorStore';
import { DEFAULT_FIELDS } from '../utils/storage/selectorStore';

type PanelState = 'idle' | 'scraping' | 'success' | 'error';
type ResultTab = 'info' | 'variants' | 'images';

export default function Panel() {
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [product, setProduct] = useState<ScrapedProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostname, setHostname] = useState('');
  const [tabId, setTabId] = useState(0);
  const [selectorMap, setSelectorMap] = useState<SelectorMap | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>(
    DEFAULT_FIELDS.map(f => ({ ...f, selector: '' }))
  );
  const [activeField, setActiveField] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>('info');
  const [history, setHistory] = useState<ScrapedProduct[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const tid = chrome.devtools.inspectedWindow.tabId;
    setTabId(tid);

    chrome.tabs.get(tid, tab => {
      if (!tab.url) return;
      try {
        const h = new URL(tab.url).hostname;
        setHostname(h);
        chrome.storage.local.get('selectorMaps', result => {
          const maps = result.selectorMaps || {};
          if (maps[h]) {
            setSelectorMap(maps[h]);
            const saved = maps[h].fields as FieldDefinition[];
            // Merge saved selectors back into the default field order
            setFields(DEFAULT_FIELDS.map(def => {
              const match = saved.find(s => s.name === def.name);
              return match ? { ...def, selector: match.selector } : { ...def, selector: '' };
            }));
          }
        });
      } catch {}
    });

    chrome.storage.local.get('recentProducts', result => {
      setHistory(result.recentProducts || []);
    });
  }, []);

  useEffect(() => {
    const handler = (msg: { type: string; payload?: { field: string; selector: string } }) => {
      if (msg.type === 'PICKER_SELECTED' && msg.payload) {
        setFields(prev => prev.map(f =>
          f.name === msg.payload!.field ? { ...f, selector: msg.payload!.selector } : f
        ));
        setActiveField(null);
      }
      if (msg.type === 'PICKER_CANCELLED') {
        setActiveField(null);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const handleScrape = useCallback(async () => {
    if (!tabId) return;
    setPanelState('scraping');
    setError(null);
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_PRODUCT' }) as ScrapeResult;
      if (result.success && result.product) {
        setProduct(result.product);
        setPanelState('success');
        setResultTab('info');
        chrome.storage.local.get('recentProducts', r => setHistory(r.recentProducts || []));
      } else {
        setError(result.error || 'No product data found');
        setPanelState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach content script — try reloading the page');
      setPanelState('error');
    }
  }, [tabId]);

  const startPick = useCallback(async (fieldName: string) => {
    if (!tabId) return;
    setActiveField(fieldName);
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'START_PICKER', payload: { field: fieldName } });
    } catch {
      setActiveField(null);
    }
  }, [tabId]);

  const clearField = useCallback((fieldName: string) => {
    setFields(prev => prev.map(f => f.name === fieldName ? { ...f, selector: '' } : f));
  }, []);

  const handleSave = useCallback(async () => {
    const now = new Date().toISOString();
    const map: SelectorMap = {
      hostname,
      fields: fields.filter(f => f.selector),
      createdAt: selectorMap?.createdAt || now,
      updatedAt: now,
    };
    const result = await chrome.storage.local.get('selectorMaps');
    const maps = result.selectorMaps || {};
    maps[hostname] = map;
    await chrome.storage.local.set({ selectorMaps: maps });
    setSelectorMap(map);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [fields, hostname, selectorMap]);

  const handleReset = useCallback(async () => {
    setFields(DEFAULT_FIELDS.map(f => ({ ...f, selector: '' })));
    const result = await chrome.storage.local.get('selectorMaps');
    const maps = result.selectorMaps || {};
    delete maps[hostname];
    await chrome.storage.local.set({ selectorMaps: maps });
    setSelectorMap(null);
  }, [hostname]);

  const formatPrice = (price: string | undefined) => {
    if (!price) return 'N/A';
    const n = parseFloat(price);
    return isNaN(n) ? price : `$${n.toFixed(2)}`;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-sm">
      {/* Sidebar — custom selectors */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-base">🦀</span>
            <span className="font-semibold text-gray-800">Custom Selectors</span>
          </div>
          {hostname && (
            <p className="text-xs text-gray-400 mt-1 truncate" title={hostname}>{hostname}</p>
          )}
        </div>

        {activeField && (
          <div className="mx-3 mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
            <strong>Picking {fields.find(f => f.name === activeField)?.label}…</strong>
            <br />Switch to the page tab, hover an element, then click.
            Press Escape to cancel.
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {fields.map(field => (
            <div key={field.name} className="rounded-lg border border-gray-200 p-2 bg-white">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-700">{field.label}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => startPick(field.name)}
                    className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                      activeField === field.name
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {activeField === field.name ? '…' : 'Pick'}
                  </button>
                  {field.selector && (
                    <button
                      onClick={() => clearField(field.name)}
                      className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100"
                      title="Clear selector"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={field.selector}
                onChange={e => setFields(prev => prev.map(f =>
                  f.name === field.name ? { ...f, selector: e.target.value } : f
                ))}
                placeholder="CSS selector…"
                className="w-full text-xs font-mono border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-emerald-400 bg-gray-50"
              />
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-gray-100 flex gap-2">
          <button onClick={handleSave} className="flex-1 btn btn-primary text-xs py-1.5">
            {saved ? '✓ Saved' : 'Save'}
          </button>
          <button onClick={handleReset} className="btn btn-secondary text-xs px-3 py-1.5">
            Reset
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={handleScrape}
            disabled={panelState === 'scraping'}
            className="btn btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
          >
            {panelState === 'scraping' ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scraping…
              </>
            ) : 'Scrape Page'}
          </button>

          {panelState === 'success' && product && (
            <span className="text-xs text-emerald-600 font-medium truncate">
              ✓ {product.title.length > 50 ? product.title.slice(0, 50) + '…' : product.title}
            </span>
          )}
          {panelState === 'error' && error && (
            <span className="text-xs text-red-600 truncate">{error}</span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4">
          {panelState === 'idle' && (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 select-none">
              <span className="text-5xl mb-3">🦀</span>
              <p className="font-medium text-gray-500">Click "Scrape Page" to extract product data</p>
              <p className="text-xs mt-1">Navigate to a product page first</p>
            </div>
          )}

          {panelState === 'success' && product && (
            <div className="space-y-4 max-w-3xl">
              {/* Product header card */}
              <div className="card p-4">
                <div className="flex gap-4">
                  {product.images[0] && (
                    <img
                      src={product.images[0].src}
                      alt={product.title}
                      className="w-20 h-20 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900 text-base leading-snug">{product.title}</h2>
                    {product.vendor && <p className="text-sm text-gray-500 mt-0.5">{product.vendor}</p>}
                    {product.variants[0]?.price && (
                      <p className="text-emerald-600 font-semibold mt-1">{formatPrice(product.variants[0].price)}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-emerald-50 text-emerald-700 capitalize">
                        {product.platform || 'generic'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}
                        {' · '}
                        {product.images.length} image{product.images.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabbed detail card */}
              <div className="card overflow-hidden">
                <div className="flex border-b border-gray-100">
                  {(['info', 'variants', 'images'] as ResultTab[]).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setResultTab(tab)}
                      className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                        resultTab === tab
                          ? 'text-emerald-600 border-b-2 border-emerald-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab}
                      {tab === 'variants' && ` (${product.variants.length})`}
                      {tab === 'images' && ` (${product.images.length})`}
                    </button>
                  ))}
                </div>

                <div className="p-4">
                  {resultTab === 'info' && (
                    <div className="space-y-3 text-sm">
                      {product.handle && (
                        <div>
                          <span className="text-gray-500">Handle: </span>
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{product.handle}</code>
                        </div>
                      )}
                      {product.description && (
                        <div>
                          <p className="text-gray-500 mb-1">Description</p>
                          <p className="text-gray-700 text-sm leading-relaxed line-clamp-6">{product.description}</p>
                        </div>
                      )}
                      {product.tags && product.tags.length > 0 && (
                        <div>
                          <p className="text-gray-500 mb-1">Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {product.tags.map((tag, i) => (
                              <span key={i} className="tag-pill">{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {product.productType && (
                        <div>
                          <span className="text-gray-500">Type: </span>
                          <span className="text-gray-700">{product.productType}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {resultTab === 'variants' && (
                    <div className="space-y-2">
                      {product.variants.map((v, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            {v.options.map((opt, j) => (
                              <span key={j} className="variant-pill">{opt.name}: {opt.value}</span>
                            ))}
                            {v.options.length === 0 && <span className="text-gray-400 text-xs">Default</span>}
                            {v.sku && <span className="text-xs text-gray-400">SKU: {v.sku}</span>}
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <div className="font-medium text-gray-900">{formatPrice(v.price)}</div>
                            {v.compareAtPrice && (
                              <div className="text-xs text-gray-400 line-through">{formatPrice(v.compareAtPrice)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {resultTab === 'images' && (
                    <div className="grid grid-cols-5 gap-2">
                      {product.images.map((img, i) => (
                        <a key={i} href={img.src} target="_blank" rel="noopener noreferrer" title={img.src}>
                          <img
                            src={img.src}
                            alt={img.alt || `Image ${i + 1}`}
                            className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:border-emerald-400 transition-colors"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Recent history */}
          {history.length > 0 && (
            <div className={`${panelState === 'success' ? 'mt-6' : ''} max-w-3xl`}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recent Products</h3>
              <div className="space-y-1.5">
                {history.slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                    {p.images[0] && (
                      <img
                        src={p.images[0].src}
                        alt={p.title}
                        className="w-9 h-9 rounded object-cover border border-gray-200 flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                      <p className="text-xs text-gray-400 truncate">{p.sourceUrl}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs text-gray-400 capitalize">{p.platform}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
