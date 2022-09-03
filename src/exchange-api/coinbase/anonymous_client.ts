import CoinbasePro, {
  Candle,
  CandleGranularity,
  Currency,
  OrderBookLevel,
  OrderBookLevel2,
  Product,
  ProductTicker,
} from 'coinbase-pro-node';
import {initCoinbaseClient} from './init_client';

interface ProductOrderCount {
  sells: number;
  buys: number;
  total: number;
}

export class AnonymousClient {
  private static httpClient: CoinbasePro = initCoinbaseClient(false);

  /**
   * Get candles from Coinbase API.
   * Note: 'start' is the oldest date, 'end' is the newest date.
   *
   * @param {string} productId - A string representing a product/pair.
   * @param {CandleGranularity} granularity - Size of the candles in SECONDS.
   * @param {Date} start - Oldest date to start from.
   * @param {Date} end - Newest date to end at.
   * @returns {Promise<Candle[]>} Candles from the desired period of time
   * in order from [oldest -> newest].
   */
  static async getCandles(
    productId: string,
    granularity: CandleGranularity,
    start: Date,
    end: Date,
  ): Promise<Candle[]> {
    // Fix the dates if they were reversed.
    if (end.getTime() < start.getTime()) {
      const temp = end;
      end = start;
      start = temp;
    }

    // Grab the candles.
    return AnonymousClient.httpClient.rest.product
      .getCandles(productId, {
        end: end.toISOString(),
        granularity: granularity,
        start: start.toISOString(),
      })
      .then((data) => {
        if (data) {
          // Make sure our data is oldest to newest.
          data.sort((a, b) => (a.openTimeInISO < b.openTimeInISO ? -1 : 1));
        }
        return data ?? [];
      })
      .catch((err) => {
        let errMsg = 'no data provided by API';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        throw new Error(`Could not pull '${productId}' candles: ${errMsg}`);
      });
  }

  /**
   * Get a singular pairs / product ticker currently accessible with the Coinbase API.
   *
   * @param {string} productId - Product / pair ticker to get.
   * @returns {ProductTicker} Product Ticker returned from coinbase.
   */
  static async getTicker(productId: string): Promise<ProductTicker> {
    return AnonymousClient.httpClient.rest.product
      .getProductTicker(productId)
      .then((data) => {
        if (!data) throw new Error(`no product ticker for '${productId}'`);
        return data;
      })
      .catch((err) => {
        let errMsg = 'no data provided by API';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        throw new Error(`Could not pull ticker: ${errMsg}`);
      });
  }

  /**
   * Get a singular pairs / product currently accessible with the Coinbase API.
   *
   * @param {string} productId - Product / pair to get.
   * @returns {Product} Product returned from coinbase.
   */
  static async getProduct(productId: string): Promise<Product> {
    return AnonymousClient.httpClient.rest.product
      .getProduct(productId)
      .then((data) => {
        if (!data) throw new Error(`no product information for '${productId}'`);
        return data;
      })
      .catch((err) => {
        let errMsg = 'no data provided by API';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        throw new Error(`Could not pull product: ${errMsg}`);
      });
  }

  /**
   * Get all pairs / products currently accessible with the Coinbase API.
   *
   * @returns {Product[]} Array of products returned from coinbase.
   */
  static async getProducts(): Promise<Product[]> {
    return AnonymousClient.httpClient.rest.product
      .getProducts()
      .then((data) => {
        return data ?? [];
      })
      .catch((err) => {
        let errMsg = 'no data provided by API';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        throw new Error(`Could not pull products: ${errMsg}`);
      });
  }

  /**
   * Get all currencies currently accessible with the Coinbase API.
   *
   * @returns {Currency[]} Array of currencies returned from coinbase.
   */
  static async getCurrencies(): Promise<Currency[]> {
    return AnonymousClient.httpClient.rest.currency
      .listCurrencies()
      .then((data) => {
        return data ?? [];
      })
      .catch((err) => {
        let errMsg = 'no data provided by API';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        throw new Error(`Could not pull currencies: ${errMsg}`);
      });
  }

  /**
   * Get the top 50 Bids and Asks for a specific product / pair.
   *
   * @param {string} productId - Product / Pair to request information for.
   * @returns {Promise<OrderBookLevel2>} Level2 Book containing all of the data.
   */
  static async getProductBook2(productId: string): Promise<OrderBookLevel2> {
    return AnonymousClient.httpClient.rest.product
      .getProductOrderBook(productId, {
        level: OrderBookLevel.TOP_50_BIDS_AND_ASKS,
      })
      .then((data) => {
        if (data === undefined) throw new Error('data for product book empty.');
        return data;
      })
      .catch((err) => {
        let errMsg = 'no data provided by API';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        throw new Error(`Could not pull '${productId}' level2 book: ${errMsg}`);
      });
  }

  /**
   * Get amount of orders for the top 50 Bid and Ask prices for a specific product / pair.
   *
   * @param {string} productId - Product / Pair to request information for.
   * @returns {Promise<ProductOrderCount>} Asks, Bids, and total amount of orders for top 50.
   */
  static async getOrderCount(productId: string): Promise<ProductOrderCount> {
    const book = await this.getProductBook2(productId)
      .then((data) => {
        return data;
      })
      .catch((err) => {
        throw err;
      });

    const tAsks: number = book.asks.reduce((a, b) => {
      return a + b[2];
    }, 0);
    const tBids: number = book.bids.reduce((a, b) => {
      return a + b[2];
    }, 0);

    return {sells: tAsks, buys: tBids, total: tAsks + tBids};
  }
}
