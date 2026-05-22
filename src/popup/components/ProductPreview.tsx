import { useState } from 'react';
import type { ScrapedProduct } from '../../types';

interface ProductPreviewProps {
  product: ScrapedProduct;
}

export function ProductPreview({ product }: ProductPreviewProps) {
  const [showAllImages, setShowAllImages] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'variants' | 'images'>('info');

  const displayedImages = showAllImages ? product.images : product.images.slice(0, 4);
  const hasMoreImages = product.images.length > 4;

  const formatPrice = (price: string | undefined) => {
    if (!price) return 'N/A';
    const num = parseFloat(price);
    return isNaN(num) ? price : `$${num.toFixed(2)}`;
  };

  return (
    <div className="card overflow-hidden animate-fadeIn">
      {/* Product Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex gap-3">
          {product.images[0] && (
            <img
              src={product.images[0].src}
              alt={product.title}
              className="w-16 h-16 rounded-lg object-cover border border-gray-200"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="%23f3f4f6" width="64" height="64"/><text x="32" y="36" text-anchor="middle" fill="%239ca3af" font-size="12">No img</text></svg>';
              }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate" title={product.title}>
              {product.title}
            </h3>
            {product.vendor && (
              <p className="text-sm text-gray-500">{product.vendor}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {product.variants[0]?.price && (
                <span className="text-sm font-medium text-emerald-600">
                  {formatPrice(product.variants[0].price)}
                </span>
              )}
              {product.variants[0]?.compareAtPrice && (
                <span className="text-xs text-gray-400 line-through">
                  {formatPrice(product.variants[0].compareAtPrice)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Platform badge */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-emerald-50 text-emerald-700 capitalize">
            {product.platform || 'generic'}
          </span>
          {product.productType && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
              {product.productType}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''} | {product.images.length} image{product.images.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'info'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Info
        </button>
        <button
          onClick={() => setActiveTab('variants')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'variants'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Variants ({product.variants.length})
        </button>
        <button
          onClick={() => setActiveTab('images')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'images'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Images ({product.images.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[200px] overflow-y-auto">
        {activeTab === 'info' && (
          <div className="space-y-3 text-sm">
            {product.handle && (
              <div>
                <span className="text-gray-500">Handle:</span>{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{product.handle}</code>
              </div>
            )}
            {product.description && (
              <div>
                <span className="text-gray-500">Description:</span>
                <p className="text-gray-700 mt-1 line-clamp-3">{product.description}</p>
              </div>
            )}
            {product.tags && product.tags.length > 0 && (
              <div>
                <span className="text-gray-500">Tags:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {product.tags.slice(0, 5).map((tag, i) => (
                    <span key={i} className="tag-pill">{tag}</span>
                  ))}
                  {product.tags.length > 5 && (
                    <span className="text-xs text-gray-400">+{product.tags.length - 5} more</span>
                  )}
                </div>
              </div>
            )}
            {product.seoTitle && (
              <div>
                <span className="text-gray-500">SEO Title:</span>{' '}
                <span className="text-gray-700">{product.seoTitle}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'variants' && (
          <div className="space-y-2">
            {product.variants.map((variant, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {variant.options.map((opt, i) => (
                    <span key={i} className="variant-pill">
                      {opt.name}: {opt.value}
                    </span>
                  ))}
                  {variant.options.length === 0 && (
                    <span className="text-gray-400">Default</span>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-medium text-gray-900">
                    {formatPrice(variant.price)}
                  </div>
                  {variant.sku && (
                    <div className="text-xs text-gray-400">SKU: {variant.sku}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'images' && (
          <div>
            <div className="image-grid">
              {displayedImages.map((image, index) => (
                <img
                  key={index}
                  src={image.src}
                  alt={image.alt || `Product image ${index + 1}`}
                  title={image.src}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ))}
            </div>
            {hasMoreImages && !showAllImages && (
              <button
                onClick={() => setShowAllImages(true)}
                className="mt-2 text-sm text-emerald-600 hover:text-emerald-700"
              >
                Show all {product.images.length} images
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
