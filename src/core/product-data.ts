import {CANDLE_GRANULARITY, coreErr, MAX_DAYS_OF_DATA, ONE_DAY_TO_S} from '.';
import {AnonymousClient} from '../exchange-api/coinbase';
import {SimpleCandle} from '../models';
import {toFixed} from '../product';
import {BucketData, createBucketData} from './bucket';
import {combineCandles, getCandles, loadCandleData} from './candle';
import {Indicators} from './indicators';
import {calcMACD, calcRSI} from './indicators';
import {
  calcEMA,
  getLastMA,
  MACD,
  MASet,
  MAValues,
  calcSMA,
} from './indicators/ma';
import {DataOpts} from './opts';
import {makeRanking, ProductRanking, UNSET_MA_SET} from './rank';

const PRODUCT_BUCKETS = new Map<string, BucketData[]>();
const PRODUCT_DATA = new Map<string, ProductData>();

function lastN(n: number[]): number | undefined {
  if (n.length === 0) return;
  return n[n.length - 1];
}

export interface ProductUpdate {
  data: ProductRanking | undefined;
  ts: {
    candles: number;
    buckets: number;
    indicators: number;
    ranks: number;
  };
}

export class ProductData {
  private oldestISO: string = '';
  lastRanking: ProductRanking | undefined;
  currentRanking: ProductRanking | undefined;
  productId: string = '';
  lastTimestamp: Date = new Date(this.oldestISO);

  constructor(
    productId: string,
    oldestISO: string,
    fromInitializer: boolean = false,
  ) {
    // Attempt to prevent initializing normally.
    if (!fromInitializer) {
      throw new Error('Can only initialize new Product Data from initializer.');
    }
    this.productId = productId;
    this.oldestISO = oldestISO;

    // Required to pass the function and retain 'this'
    this.formatQuote = this.formatQuote.bind(this);
  }

  /**
   * Get the last timestamp of the candle, otherwise default to oldest possible.
   *
   * @param {SimpleCandle[]} candles - Candles to analyze for latest timestamp.
   */
  private setLastTimestamp(candles: SimpleCandle[]) {
    if (candles.length === 0) return new Date(this.oldestISO);
    this.lastTimestamp = new Date(candles[candles.length - 1].openTimeInISO);
  }

  /**
   * Get the last close of the last bucket, otherwise -1.
   *
   * @returns {number} Value of the last close.
   */
  get lastClose(): number {
    const buckets = this.getBuckets();
    if (buckets.length === 0) return -1;
    return buckets[buckets.length - 1].lastCandle.close;
  }

  /**
   * Get the current ranking if they exist.
   *
   * @returns {ProductRanking | undefined} Rankin, if found.
   */
  get ranking(): ProductRanking | undefined {
    return this.currentRanking;
  }

  /**
   * Get the currently stored buckets.
   *
   * @returns {BucketData[]} Bucket data belonging to the product.
   */
  getBuckets(): BucketData[] {
    return PRODUCT_BUCKETS.get(this.productId) ?? [];
  }

  /**
   * Overrides the currently saved buckets with the new buckets.
   *
   * @param {BucketData[]} buckets - Bucket data to save.
   */
  private setBuckets(buckets: BucketData[]) {
    PRODUCT_BUCKETS.set(this.productId, buckets);
  }

  /**
   * Generates the data options for currently creating candles and buckets.
   */
  private createDataOpts(): DataOpts {
    return new DataOpts(
      this.lastTimestamp,
      {
        granularity: CANDLE_GRANULARITY,
        pullNew: false,
      },
      {
        candlesPer: ONE_DAY_TO_S / CANDLE_GRANULARITY,
        total: MAX_DAYS_OF_DATA,
      },
    );
  }

  /**
   * Updates the candles, pulling new information from remote sources. Combines them
   * with existing data.
   *
   * @param {DataOpts} opts - Options that modify what data is pulled from remote sources.
   */
  private async updateCandles(
    oldCandles: SimpleCandle[],
    opts: DataOpts,
  ): Promise<SimpleCandle[]> {
    const candles = await getCandles(this.productId, opts, this.lastTimestamp);
    if (candles.length === 0) return oldCandles;

    // Combine the new data into the old data.
    return combineCandles(
      oldCandles,
      candles,
      opts.start.toISOString(),
      opts.totalCandleCount,
    );
  }

  /**
   * Creates buckets from candles that are currently saved. Buckets are just grouped data
   * from multiple candles.
   *
   * @param {DataOpts} opts - Options that modify how the buckets are created.
   * @returns {BucketData[]} Newly created grouped candle data.
   */
  private createBuckets(candles: SimpleCandle[], opts: DataOpts): BucketData[] {
    if (candles.length === 0) return [];
    return createBucketData(candles, opts);
  }

  /**
   * Generates indicators for the product. These include: smas, emas, macds, etc.
   *
   * @param {number[]} closes - List of closes from oldest to newest.
   */
  private createIndicators(closes: number[]): Indicators {
    const maSet = this.createMASet(closes);
    const short = maSet.ema.twelve ?? [];
    const long = maSet.ema.twentysix ?? [];
    const macds = this.createMACD(short, long);
    const rsi = calcRSI(closes);

    return <Indicators>{
      rsi: lastN(rsi),
      macd: {
        value: lastN(macds.value),
        signal: lastN(macds.signal),
      },
      sma: getLastMA(maSet.sma),
      ema: getLastMA(maSet.ema),
    };
  }

  /**
   * Creates EMA and SMAs based on grouped candles into periods of days.
   *
   * @returns {MASet} EMA and SMAs of the currently existing data.
   */
  private createMASet(closes: number[]): MASet {
    if (closes.length === 0) return UNSET_MA_SET;

    // Get the SMAs
    const sma: MAValues = {
      twelve: calcSMA(closes, 12, this.formatQuote),
      twentysix: calcSMA(closes, 26, this.formatQuote),
      fifty: calcSMA(closes, 50, this.formatQuote),
      twohundred: calcSMA(closes, 200, this.formatQuote),
    };

    // Get the EMAs
    const ema: MAValues = {
      twelve: calcEMA(closes, 12, this.formatQuote),
      twentysix: calcEMA(closes, 26, this.formatQuote),
      fifty: calcEMA(closes, 50, this.formatQuote),
      twohundred: calcEMA(closes, 200, this.formatQuote),
    };

    return {sma: sma, ema: ema};
  }

  /**
   * Creates a MACD for the product including the 9-day signal.
   *
   * @param {number[]} shortEMA - Short EMA to calculate on.
   * @param {number[]} longEMA - Long EMA to calculate on.
   * @returns {MACD} Resulting MACD from the calculation.
   */
  private createMACD(shortEMA: number[], longEMA: number[]): MACD {
    const macds = calcMACD(shortEMA, longEMA, this.formatQuote);

    return <MACD>{
      value: macds,
      signal: calcEMA(macds, 9, this.formatQuote),
    };
  }

  /**
   * Formats a number according the the 'quote' precision. Used as a callback to format
   * in other functions.
   *
   * @param {number} value - Number to format.
   * @returns {number} Newly formatted number.
   */
  formatQuote(value: number): number {
    return toFixed(this.productId, value, 'quote');
  }

  /**
   * Update the Product, pulling new candles, creating new buckets, generating the
   * movement, and lastly updating the rank.
   *
   * @param {{ts: Date; pullNew: boolean} opts - Optional, used to override for updates.
   * @returns {Promise<ProductUpdate>} Contains the new rank and statistical time data.
   */
  async update(opts?: {ts: Date; pullNew: boolean}): Promise<ProductUpdate> {
    let {candles} = await loadCandleData(this.productId);

    // Update the timestamp because we may have gotten new candles.
    //   Get updated data pulling options.
    this.setLastTimestamp(candles);
    let dataOpts = this.createDataOpts();

    if (opts) {
      dataOpts.setEnd(opts.ts);
      dataOpts.setPullNew(opts.pullNew);
      // This is a true update, get new candle data.
      candles = await this.updateCandles(candles, dataOpts);

      // Reassign because newer data may have been acquired.
      this.setLastTimestamp(candles);
      dataOpts = this.createDataOpts();
    }

    // Generate the buckets from new candles.
    const buckets = this.createBuckets(candles, dataOpts);
    this.setBuckets(buckets);

    // Create the closes from buckets, used for indicators.
    const closes = buckets.map((b) => b.price.close);
    let change: number = 0;
    if (closes.length > 1) {
      const ratio = closes[closes.length - 1] / closes[closes.length - 2];
      change = (ratio - 1) * 100;
    }

    // Generate the new movement.
    let movement: number = -1;
    if (opts) movement = await this.getMovement();

    // Create the indicators
    const indicators = this.createIndicators(closes);

    // Create the new ranking and update if created.
    const newRanking = makeRanking(
      this.productId,
      buckets,
      change,
      indicators,
      movement,
    );
    if (newRanking) {
      this.lastRanking = this.currentRanking;
      this.currentRanking = newRanking;
    }

    return {
      data: newRanking,
      ts: {
        candles: 0,
        buckets: 0,
        indicators: 0,
        ranks: 0,
      },
    };
  }

  /**
   * Gets the buying/selling orders from a remote source, calculates the ratio.
   *
   * @returns {Promise<number>} Ratio of buying/selling indicating direction.
   */
  private async getMovement(): Promise<number> {
    return AnonymousClient.getOrderCount(this.productId)
      .then((data) => {
        const {buys, sells} = data;
        if (sells === 0) return buys;
        return buys / sells;
      })
      .catch((err) => {
        coreErr(err);
        return -1;
      });
  }

  /**
   * Get a ProductData from the available products.
   *
   * @param {string} productId - Product/paid to obtain.
   * @returns {ProductData | undefined} Product Data, if found.
   */
  static find(productId: string): ProductData | undefined {
    return PRODUCT_DATA.get(productId);
  }

  /**
   * Saves/updates the product data locally in RAM.
   *
   * @param {ProductData} data - Data to be saved/updated.
   */
  static save(data: ProductData) {
    PRODUCT_DATA.set(data.productId, data);
  }

  /**
   * Intialize a product data, loading the candle data and saving it.
   *
   * @param {string} productId - Product/Pair to create data for.
   * @param {string} oldestISO - Oldest timestamp to default to with no candles found.
   * @returns {Promise<ProductData>} Newly created data for a product.
   */
  static async initialize(
    productId: string,
    oldestISO: string,
  ): Promise<ProductData> {
    const data = ProductData.find(productId);
    if (data) return data;

    // Create it if it does not exist.
    const newData = new ProductData(productId, oldestISO, true);

    ProductData.save(newData);
    return newData;
  }
}
