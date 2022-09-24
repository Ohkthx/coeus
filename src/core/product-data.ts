import {CANDLE_GRANULARITY, coreErr, MAX_DAYS_OF_DATA, ONE_DAY_TO_S} from '.';
import {AnonymousClient} from '../exchange-api/coinbase';
import {SimpleCandle} from '../models';
import {toFixed} from '../product';
import {BucketData, createBucketData} from './bucket';
import {combineCandles, getCandles, loadCandleData} from './candle';
import {Indicators} from './indicators';
import {calcMACD} from './indicators/analysis';
import {ema, getLastMA, MACD, MASet, MAValues, sma} from './indicators/ma';
import {DataOpts} from './opts';
import {makeRanking, ProductRanking, UNSET_MA_SET} from './rank';

const PRODUCT_CANDLES = new Map<string, SimpleCandle[]>();
const PRODUCT_DATA = new Map<string, ProductData>();

function lastN(n: number[]): number | undefined {
  if (n.length === 0) return;
  return n[n.length - 1];
}

export class ProductData {
  private initialized: boolean = false;
  private oldestISO: string = '';
  lastRanking: ProductRanking | undefined;
  currentRanking: ProductRanking | undefined;
  productId: string = '';

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
   * @returns {Date} Date of the most recent timestamp.
   */
  get lastTimestamp(): Date {
    const candles = this.getCandles();
    if (candles.length === 0) return new Date(this.oldestISO);
    return new Date(candles[candles.length - 1].openTimeInISO);
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
   * Get the currently stored candles.
   *
   * @returns {SimpleCandle[]} Candles belonging to the product.
   */
  getCandles(): SimpleCandle[] {
    return PRODUCT_CANDLES.get(this.productId) ?? [];
  }

  /**
   * Overrides the currently saved candles with the new candles.
   *
   * @param {SimpleCandle[]} candles - Candles to save.
   */
  private setCandles(candles: SimpleCandle[]) {
    PRODUCT_CANDLES.set(this.productId, candles);
  }

  /**
   * Updeates the candles, pulling new information from remote sources. Combines them
   * with existing data.
   *
   * @param {DataOpts} opts - Options that modify what data is pulled from remote sources.
   */
  async updateCandles(opts: DataOpts) {
    const candles = await getCandles(this.productId, opts, this.lastTimestamp);
    if (candles.length === 0) return;

    // Combine the new data into the old data and save it locally.
    this.setCandles(
      combineCandles(
        this.getCandles(),
        candles,
        opts.start.toISOString(),
        opts.totalCandleCount,
      ),
    );
  }

  /**
   * Creates buckets from candles that are currently saved. Buckets are just grouped data
   * from multiple candles.
   *
   * @param {DataOpts} opts - Options that modify how the buckets are created.
   * @returns {BucketData[]} Newly created grouped candle data.
   */
  createBuckets(opts: DataOpts): BucketData[] {
    if (this.getCandles().length === 0) return [];
    return createBucketData(this.getCandles(), opts);
  }

  /**
   * Generates indicators for the product. These include: smas, emas, macds, etc.
   */
  createIndicators(): Indicators {
    const maSet = this.createMASet();
    const short = maSet.ema.twelve ?? [];
    const long = maSet.ema.twentysix ?? [];
    const macds = this.createMACD(short, long);

    return <Indicators>{
      sma: getLastMA(maSet.sma),
      ema: getLastMA(maSet.ema),
      macd: {
        value: lastN(macds.value),
        signal: lastN(macds.signal),
      },
    };
  }

  /**
   * Creates EMA and SMAs based on grouped candles into periods of days.
   *
   * @returns {MASet} EMA and SMAs of the currently existing data.
   */
  private createMASet(): MASet {
    // Generate the new MAs.
    const opts = new DataOpts(
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

    const closes = this.createBuckets(opts).map((d) => d.price.close);
    if (closes.length === 0) return UNSET_MA_SET;

    // Get the SMAs
    const SMA: MAValues = {
      twelve: sma(closes, 12, this.formatQuote),
      twentysix: sma(closes, 26, this.formatQuote),
      fifty: sma(closes, 50, this.formatQuote),
      twohundred: sma(closes, 200, this.formatQuote),
    };

    // Get the EMAs
    const EMA: MAValues = {
      twelve: ema(closes, 12, this.formatQuote),
      twentysix: ema(closes, 26, this.formatQuote),
      fifty: ema(closes, 50, this.formatQuote),
      twohundred: ema(closes, 200, this.formatQuote),
    };

    return {sma: SMA, ema: EMA};
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
      signal: ema(macds, 9, this.formatQuote),
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
   * Update rankings based on the current candle data.
   *
   * @param {number} movement - Current buying/selling ratio, defaults to -1.
   * @returns {ProductRanking | undefined} Newly calculated ranking if no errors.
   */
  updateRanking(movement: number = -1): ProductRanking | undefined {
    const opts = new DataOpts(
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

    const newRanking = makeRanking(
      this.productId,
      this.createBuckets(opts),
      this.createIndicators(),
      movement,
    );

    // Update the rankings if a new one was created.
    if (newRanking) {
      this.lastRanking = this.currentRanking;
      this.currentRanking = newRanking;
    }

    return newRanking;
  }

  /**
   * Gets the buying/selling orders from a remote source, calculates the ratio.
   *
   * @returns {Promise<number<} Ratio of buying/selling indicating direction.
   */
  async getMovement(): Promise<number> {
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
   * Loads candles from a database and saves it locally to be used.
   */
  private async loadCandles() {
    if (this.initialized) return;
    const {candles} = await loadCandleData(this.productId);
    PRODUCT_CANDLES.set(this.productId, candles);
    this.initialized = true;
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
    await newData.loadCandles();

    ProductData.save(newData);
    return newData;
  }
}
