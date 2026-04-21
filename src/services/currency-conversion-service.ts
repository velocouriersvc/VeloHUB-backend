import axios from 'axios';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('CurrencyConversionService');

/**
 * Exchange rate cache to avoid hitting API on every request
 */
interface ExchangeRateCache {
    rates: Record<string, number>;
    timestamp: number;
    baseCurrency: string;
}

/**
 * Service for real-time currency conversion using exchangerate-api.com
 * Free tier: 1,500 requests/month
 * Standard tier: 100,000 requests/month
 * 
 * Fallback: If API fails, uses approximate hardcoded rates
 */
export class CurrencyConversionService {
    private cache: ExchangeRateCache | null = null;
    private readonly CACHE_DURATION_MS = 3600000; // 1 hour
    private readonly API_KEY = process.env.EXCHNAGE_RATE_API_KEY || ''; // Note: env var has typo "EXCHNAGE"
    private readonly API_BASE_URL = this.API_KEY 
        ? `https://v6.exchangerate-api.com/v6/${this.API_KEY}/latest`
        : 'https://open.er-api.com/v6/latest';
    
    // Fallback rates if API is unavailable (same as before)
    private readonly FALLBACK_RATES: Record<string, number> = {
        USD: 1.0,
        GHS: 0.063,    // ≈ 15.87 GHS per USD
        NGN: 0.00067,  // ≈ 1,500 NGN per USD
        CAD: 0.71,
        INR: 0.012,    // ≈ 83 INR per USD
        EUR: 1.08,
        GBP: 1.26,
        KES: 0.0077,   // ≈ 130 KES per USD
        ZAR: 0.055,    // ≈ 18 ZAR per USD
    };

    /**
     * Fetch latest exchange rates from API
     */
    private async fetchExchangeRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
        try {
            const response = await axios.get(`${this.API_BASE_URL}/${baseCurrency}`, {
                timeout: 5000, // 5 second timeout
            });

            if (response.data && response.data.conversion_rates) {
                log.info('Exchange rates fetched successfully', {
                    baseCurrency,
                    ratesCount: Object.keys(response.data.conversion_rates).length,
                    apiUsed: this.API_KEY ? 'exchangerate-api.com' : 'open.er-api.com',
                });
                return response.data.conversion_rates;
            }

            // Fallback to 'rates' field for open.er-api.com
            if (response.data && response.data.rates) {
                log.info('Exchange rates fetched successfully (legacy format)', {
                    baseCurrency,
                    ratesCount: Object.keys(response.data.rates).length,
                });
                return response.data.rates;
            }

            throw new Error('Invalid API response format');
        } catch (error) {
            log.warn('Failed to fetch exchange rates from API, using fallback', {
                error: (error as Error).message,
            });
            return this.FALLBACK_RATES;
        }
    }

    /**
     * Get exchange rates with caching
     */
    private async getExchangeRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
        const now = Date.now();

        // Return cached rates if still valid
        if (
            this.cache &&
            this.cache.baseCurrency === baseCurrency &&
            now - this.cache.timestamp < this.CACHE_DURATION_MS
        ) {
            log.debug('Using cached exchange rates', {
                age: Math.round((now - this.cache.timestamp) / 1000) + 's',
            });
            return this.cache.rates;
        }

        // Fetch fresh rates
        const rates = await this.fetchExchangeRates(baseCurrency);

        // Update cache
        this.cache = {
            rates,
            timestamp: now,
            baseCurrency,
        };

        return rates;
    }

    /**
     * Convert an amount from one currency to another using live exchange rates
     * 
     * @param amount - Amount in the original currency
     * @param fromCurrency - Original currency code (e.g., 'GHS')
     * @param toCurrency - Target currency code (default: 'USD')
     * @returns Object with converted amount and metadata
     */
    async convertCurrency(
        amount: number,
        fromCurrency: string,
        toCurrency: string = 'USD'
    ): Promise<{
        amount: number;
        currency: string;
        originalAmount: number;
        originalCurrency: string;
        rate: number;
        timestamp: number;
    }> {
        const from = fromCurrency.toUpperCase();
        const to = toCurrency.toUpperCase();

        // If same currency, no conversion needed
        if (from === to) {
            return {
                amount,
                currency: to,
                originalAmount: amount,
                originalCurrency: from,
                rate: 1.0,
                timestamp: Date.now(),
            };
        }

        try {
            // Get exchange rates (with caching)
            const rates = await this.getExchangeRates('USD');

            // Get conversion rates
            const fromRate = rates[from] || this.FALLBACK_RATES[from];
            const toRate = rates[to] || this.FALLBACK_RATES[to];

            if (!fromRate || !toRate) {
                log.warn('Exchange rate not found, using 1:1 ratio', { from, to });
                return {
                    amount,
                    currency: to,
                    originalAmount: amount,
                    originalCurrency: from,
                    rate: 1.0,
                    timestamp: Date.now(),
                };
            }

            // Convert: amount in FROM → USD → TO
            // If rates are relative to USD: 1 USD = X FROM, 1 USD = Y TO
            // Then: FROM to TO = (1/X) * Y = Y/X
            const amountInUSD = amount / fromRate;
            const convertedAmount = amountInUSD * toRate;
            const rate = toRate / fromRate;

            const result = {
                amount: Math.round(convertedAmount * 100) / 100, // Round to 2 decimals
                currency: to,
                originalAmount: amount,
                originalCurrency: from,
                rate: Math.round(rate * 1000000) / 1000000, // 6 decimal precision
                timestamp: Date.now(),
            };

            log.info('Currency converted', {
                from: `${amount} ${from}`,
                to: `${result.amount} ${to}`,
                rate: result.rate,
            });

            return result;
        } catch (error) {
            log.error('Currency conversion failed', {
                error: (error as Error).message,
                from,
                to,
            });

            // Fallback to hardcoded rates
            const fromRate = this.FALLBACK_RATES[from] || 1;
            const toRate = this.FALLBACK_RATES[to] || 1;
            const amountInUSD = amount * fromRate;
            const convertedAmount = amountInUSD / toRate;

            return {
                amount: Math.round(convertedAmount * 100) / 100,
                currency: to,
                originalAmount: amount,
                originalCurrency: from,
                rate: fromRate / toRate,
                timestamp: Date.now(),
            };
        }
    }

    /**
     * Check if a currency is supported by Stripe for US accounts
     */
    isStripeSupportedCurrency(currency: string): boolean {
        const unsupportedCurrencies = ['GHS', 'XOF', 'XAF'];
        return !unsupportedCurrencies.includes(currency.toUpperCase());
    }

    /**
     * Get the appropriate currency for Stripe payment
     * If the original currency is not supported, returns 'USD'
     */
    getStripeCurrency(originalCurrency: string): string {
        return this.isStripeSupportedCurrency(originalCurrency) ? originalCurrency : 'USD';
    }
}

// Singleton instance
export const currencyConversionService = new CurrencyConversionService();
