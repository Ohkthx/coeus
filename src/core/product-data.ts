import {CANDLE_GRANULARITY, MAX_DAYS_OF_DATA, ONE_DAY_TO_S} from '.';
import {AnonymousClient} from '../exchange-api/coinbase';
import {SimpleCandle} from '../models';
import {toFixed} from '../product';
import {BucketData, createBucketData} from './bucket';
import {combineCandles, getCandles, loadCandleData} from './candle';
import {DataOpts} from './opts';
import {
  DayMA,
  ema,
  makeRanking,
  ProductRanking,
  sma,
  UNSET_DAY_MA,
} from './rank';

function lastN(n: number[]): number {
  return n.length === 0 ? -1 : n[n.length - 1];
}

const PRODUCT_CANDLES = new Map<string, SimpleCandle[]>();
const PRODUCT_DATA = new Map<string, ProductData>();

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
  }

  get lastTimestamp(): Date {
    const candles = this.getCandles();
    if (candles.length === 0) return new Date(this.oldestISO);
    return new Date(candles[candles.length - 1].openTimeInISO);
  }

  get ranking(): ProductRanking | undefined {
    return this.currentRanking;
  }

  getCandles(): SimpleCandle[] {
    return PRODUCT_CANDLES.get(this.productId) ?? [];
  }

  setCandles(candles: SimpleCandle[]) {
    PRODUCT_CANDLES.set(this.productId, candles);
  }

  async updateCandles(opts: DataOpts) {
    const candles = await getCandles(this.productId, opts, this.lastTimestamp);
    if (candles.length === 0) return;

    this.setCandles(
      combineCandles(
        this.getCandles(),
        candles,
        opts.start.toISOString(),
        opts.totalCandleCount,
      ),
    );
  }

  createBuckets(opts: DataOpts): BucketData[] {
    if (this.getCandles().length === 0) return [];
    return createBucketData(this.getCandles(), opts);
  }

  createDayMA(): DayMA {
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

    const q = 'quote';
    const pId = this.productId;
    const closes = this.createBuckets(opts).map((d) => d.price.close);
    if (closes.length === 0) return UNSET_DAY_MA;

    // Get the SMAs
    const SMA = {
      twelve: toFixed(pId, lastN(sma(closes, 12)), q),
      twentysix: toFixed(pId, lastN(sma(closes, 26)), q),
      fifty: toFixed(pId, lastN(sma(closes, 50)), q),
      twohundred: toFixed(pId, lastN(sma(closes, 200)), q),
    };

    // Get the EMAs
    const EMA = {
      twelve: toFixed(pId, lastN(ema(closes, 12)), q),
      twentysix: toFixed(pId, lastN(ema(closes, 26)), q),
      fifty: toFixed(pId, lastN(ema(closes, 50)), q),
      twohundred: toFixed(pId, lastN(ema(closes, 200)), q),
    };

    return {sma: SMA, ema: EMA};
  }

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

    this.lastRanking = this.currentRanking;
    this.currentRanking = makeRanking(
      this.productId,
      this.createBuckets(opts),
      this.createDayMA(),
      movement,
    );

    return this.currentRanking;
  }

  async getMovement(): Promise<number> {
    const {sells, buys} = await AnonymousClient.getOrderCount(this.productId);
    return buys / sells;
  }

  async loadCandles() {
    if (this.initialized) return;
    const {candles} = await loadCandleData(this.productId);
    PRODUCT_CANDLES.set(this.productId, candles);
    this.initialized = true;
  }

  static find(productId: string): ProductData | undefined {
    return PRODUCT_DATA.get(productId);
  }

  static save(data: ProductData) {
    PRODUCT_DATA.set(data.productId, data);
  }

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
