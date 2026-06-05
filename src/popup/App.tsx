import { useState, useCallback, useEffect } from 'react';
import type { ScrapedProduct, ValidationResult, ShopifyStoreConfig } from '../types';
import { Header } from './components/Header';
import { ScrapeButton } from './components/ScrapeButton';
import { ProductPreview } from './components/ProductPreview';
import { ExportActions } from './components/ExportActions';
import { ValidationWarnings } from './components/ValidationWarnings';
import { Toast } from './components/Toast';
import { ErrorMessage } from './components/ErrorMessage';
import { StoreConnect } from './components/StoreConnect';
import { validateProduct } from '../utils/validators';
import { generateProductCSV, generateCSVFilename } from '../utils/csv';
import { generateHandle } from '../utils/shopify';
import { downloadImagesAsZip } from '../utils/images';

type AppState = 'idle' | 'scraping' | 'success' | 'error';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'warning';
}

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [product, setProduct] = useState<ScrapedProduct | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
  const [storeConfig, setStoreConfig] = useState<ShopifyStoreConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pushingToShopify, setPushingToShopify] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['shopifyStore'], result => {
      if (result.shopifyStore) setStoreConfig(result.shopifyStore);
    });
  }, []);

  const showToast = useCallback((message: string, type: ToastState['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleScrape = useCallback(async () => {
    setState('scraping');
    setError(null);
    setProduct(null);
    setValidation(null);

    try {
      // Send message to background script to scrape
      const response = await chrome.runtime.sendMessage({ type: 'SCRAPE_PRODUCT' });

      if (response.success && response.product) {
        // Generate handle if missing
        if (!response.product.handle) {
          response.product.handle = generateHandle(response.product.title);
        }

        setProduct(response.product);
        setValidation(validateProduct(response.product));
        setState('success');

        if (response.warnings && response.warnings.length > 0) {
          showToast(`Scraped with ${response.warnings.length} warning(s)`, 'warning');
        } else {
          showToast('Product scraped successfully!', 'success');
        }
      } else {
        setError(response.error || 'Failed to scrape product data');
        setState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setState('error');
    }
  }, [showToast]);

  const handleExportCSV = useCallback(async () => {
    if (!product) return;

    try {
      const csv = generateProductCSV(product);
      const filename = generateCSVFilename(product);

      // Use Chrome downloads API
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      await chrome.downloads.download({
        url,
        filename,
        saveAs: true,
      });

      showToast('CSV downloaded successfully!', 'success');
    } catch (err) {
      showToast('Failed to download CSV', 'error');
    }
  }, [product, showToast]);

  const handleCopyCSV = useCallback(async () => {
    if (!product) return;

    try {
      const csv = generateProductCSV(product);
      await navigator.clipboard.writeText(csv);
      showToast('CSV copied to clipboard!', 'success');
    } catch (err) {
      showToast('Failed to copy CSV', 'error');
    }
  }, [product, showToast]);

  const handleDownloadImages = useCallback(async () => {
    if (!product || product.images.length === 0) return;

    setDownloadingImages(true);
    setImageProgress({ current: 0, total: product.images.length });

    try {
      await downloadImagesAsZip(product, (current, total) => {
        setImageProgress({ current, total });
      });

      showToast('Images downloaded successfully!', 'success');
    } catch (err) {
      showToast('Failed to download images', 'error');
    } finally {
      setDownloadingImages(false);
      setImageProgress({ current: 0, total: 0 });
    }
  }, [product, showToast]);

  const handlePushToShopify = useCallback(async () => {
    if (!product || !storeConfig) return;
    setPushingToShopify(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PUSH_TO_SHOPIFY',
        payload: { product, storeConfig },
      });
      if (response.success) {
        showToast(`Pushed to ${storeConfig.storeUrl}!`, 'success');
      } else {
        showToast(response.error || 'Failed to push to Shopify', 'error');
      }
    } catch {
      showToast('Failed to push to Shopify', 'error');
    } finally {
      setPushingToShopify(false);
    }
  }, [product, storeConfig, showToast]);

  const handleRetry = useCallback(() => {
    setState('idle');
    setError(null);
    setProduct(null);
    setValidation(null);
  }, []);

  return (
    <div className="min-h-[300px] flex flex-col">
      <Header
        onSettingsClick={() => setShowSettings(v => !v)}
        settingsActive={showSettings}
      />

      <main className="flex-1 p-4 space-y-4">
        {showSettings && (
          <StoreConnect
            onSave={config => {
              setStoreConfig(config ?? null);
              setShowSettings(false);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}

        {!showSettings && state === 'idle' && (
          <ScrapeButton onScrape={handleScrape} />
        )}

        {!showSettings && state === 'scraping' && (
          <div className="card p-6 text-center">
            <div className="inline-block w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-600">Scraping product data...</p>
          </div>
        )}

        {!showSettings && state === 'error' && (
          <ErrorMessage
            message={error || 'Unknown error occurred'}
            onRetry={handleRetry}
          />
        )}

        {!showSettings && state === 'success' && product && (
          <>
            {validation && (validation.warnings.length > 0 || validation.errors.length > 0) && (
              <ValidationWarnings validation={validation} />
            )}

            <ProductPreview product={product} />

            <ExportActions
              onExportCSV={handleExportCSV}
              onCopyCSV={handleCopyCSV}
              onDownloadImages={handleDownloadImages}
              onPushToShopify={handlePushToShopify}
              onConnectStore={() => setShowSettings(true)}
              imageCount={product.images.length}
              downloadingImages={downloadingImages}
              imageProgress={imageProgress}
              storeConfig={storeConfig}
              pushingToShopify={pushingToShopify}
            />

            <button
              onClick={handleRetry}
              className="w-full btn btn-secondary text-sm"
            >
              Scrape Another Product
            </button>
          </>
        )}
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
