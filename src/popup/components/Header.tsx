
export function Header() {
  return (
    <header className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
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
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
        </div>
        <div>
          <h1 className="font-semibold text-lg leading-tight">Shopify Crabber</h1>
          <p className="text-xs text-emerald-100">Product Data Scraper</p>
        </div>
      </div>
    </header>
  );
}
