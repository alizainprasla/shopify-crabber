
interface ScrapeButtonProps {
  onScrape: () => void;
}

export function ScrapeButton({ onScrape }: ScrapeButtonProps) {
  return (
    <div className="card p-6 text-center">
      <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-8 h-8 text-emerald-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-gray-800 mb-2">
        Ready to Scrape
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Navigate to a product page and click the button below to extract product data.
      </p>
      <button
        onClick={onScrape}
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
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        Scrape Current Product
      </button>
    </div>
  );
}
