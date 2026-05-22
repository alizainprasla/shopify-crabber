
interface ExportActionsProps {
  onExportCSV: () => void;
  onCopyCSV: () => void;
  onDownloadImages: () => void;
  imageCount: number;
  downloadingImages: boolean;
  imageProgress: { current: number; total: number };
}

export function ExportActions({
  onExportCSV,
  onCopyCSV,
  onDownloadImages,
  imageCount,
  downloadingImages,
  imageProgress,
}: ExportActionsProps) {
  return (
    <div className="card p-4 space-y-3">
      <h4 className="text-sm font-medium text-gray-700 mb-2">Export Options</h4>

      {/* Primary export button */}
      <button
        onClick={onExportCSV}
        className="btn btn-primary w-full"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Download Shopify CSV
      </button>

      {/* Secondary actions */}
      <div className="flex gap-2">
        <button
          onClick={onCopyCSV}
          className="btn btn-secondary flex-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
            />
          </svg>
          Copy CSV
        </button>

        <button
          onClick={onDownloadImages}
          disabled={imageCount === 0 || downloadingImages}
          className="btn btn-secondary flex-1"
        >
          {downloadingImages ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {imageProgress.current}/{imageProgress.total}
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Images ({imageCount})
            </>
          )}
        </button>
      </div>

      {/* Progress bar for image download */}
      {downloadingImages && imageProgress.total > 0 && (
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{
              width: `${(imageProgress.current / imageProgress.total) * 100}%`,
            }}
          />
        </div>
      )}

      {/* Help text */}
      <p className="text-xs text-gray-400 text-center">
        CSV is formatted for direct Shopify import
      </p>
    </div>
  );
}
