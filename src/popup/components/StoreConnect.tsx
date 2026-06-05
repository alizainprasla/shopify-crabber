import { useState, useEffect } from 'react';
import type { ShopifyStoreConfig } from '../../types';

interface StoreConnectProps {
  onSave: (config: ShopifyStoreConfig) => void;
  onClose: () => void;
}

export function StoreConnect({ onSave, onClose }: StoreConnectProps) {
  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [existing, setExisting] = useState<ShopifyStoreConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['shopifyStore'], result => {
      if (result.shopifyStore) {
        setExisting(result.shopifyStore);
        setStoreUrl(result.shopifyStore.storeUrl);
      }
    });
  }, []);

  const handleSave = async () => {
    setError('');
    const url = storeUrl.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!url) { setError('Store URL is required'); return; }
    if (!accessToken.trim()) { setError('Access token is required'); return; }

    setSaving(true);
    const config: ShopifyStoreConfig = { storeUrl: url, accessToken: accessToken.trim() };
    await chrome.storage.local.set({ shopifyStore: config });
    onSave(config);
    setSaving(false);
  };

  const handleDisconnect = async () => {
    await chrome.storage.local.remove('shopifyStore');
    setExisting(null);
    setStoreUrl('');
    setAccessToken('');
    onSave(null as unknown as ShopifyStoreConfig);
  };

  return (
    <div className="card p-4 space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">Connect Shopify Store</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {existing && (
        <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-700 font-medium">{existing.storeUrl}</span>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Disconnect
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Store URL</label>
          <input
            type="text"
            value={storeUrl}
            onChange={e => setStoreUrl(e.target.value)}
            placeholder="your-store.myshopify.com"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Admin API Access Token
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Create a custom app in your Shopify admin → Apps → Develop apps
          </p>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary w-full"
        >
          {saving ? 'Saving...' : 'Save & Connect'}
        </button>
      </div>
    </div>
  );
}
