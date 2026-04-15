const CACHE_KEY = 'trm_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  rate: number;
  timestamp: number;
}

let memoryCache: CacheEntry | null = null;

/**
 * Get the exchange rate USD → COP from Frankfurter API (free, no key).
 * Caches in memory + localStorage for 1 hour.
 */
export async function getUSDtoCOP(): Promise<number> {
  // Check memory cache
  if (memoryCache && Date.now() - memoryCache.timestamp < CACHE_TTL) {
    return memoryCache.rate;
  }

  // Check localStorage cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: CacheEntry = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL) {
        memoryCache = parsed;
        return parsed.rate;
      }
    }
  } catch {}

  // Fetch from API
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=COP');
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const rate = data.rates?.COP;
    if (!rate || typeof rate !== 'number') throw new Error('Invalid rate');

    const entry: CacheEntry = { rate, timestamp: Date.now() };
    memoryCache = entry;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch {}
    return rate;
  } catch (err) {
    console.warn('[exchangeRate] Failed to fetch TRM, using fallback', err);
    // Fallback: approximate TRM
    return 4200;
  }
}

/**
 * Convert a value between COP and USD.
 * @param value - The amount to convert
 * @param fromCurrency - Source currency code
 * @param toCurrency - Target currency code
 * @param trm - Pre-fetched TRM (USD→COP rate)
 */
export function convertWithTRM(value: number, fromCurrency: string, toCurrency: string, trm: number): number {
  if (fromCurrency === toCurrency || !trm) return value;
  if (fromCurrency === 'COP' && toCurrency === 'USD') return value / trm;
  if (fromCurrency === 'USD' && toCurrency === 'COP') return value * trm;
  return value;
}
