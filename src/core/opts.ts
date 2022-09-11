import {ONE_MINUTE_TO_S} from '.';
import {getSpan} from '../timespan';

export interface CandleOpts {
  granularity: number;
  pullNew: boolean;
}

export interface BucketOpts {
  candlesPer: number;
  total: number;
}

export class DataOpts {
  private cOpts: CandleOpts;
  private bOpts: BucketOpts;
  end: Date;

  /**
   * Creates a new set of data collecting and processing options.
   *
   * @param {number} granularity - Size of a candle in seconds.
   * @param {Date} end - Final timestamp to end candle span, should be most recent.
   * @param {number} candlesPerBucket - Amount of candles to place in each bucket.
   * @param {number} totalBuckets - Total amount of buckets.
   * @param {boolean} pullNewCandles - Get new candles from API if needed.
   */
  constructor(end: Date, candleOpts: CandleOpts, bucketOpts: BucketOpts) {
    this.cOpts = candleOpts;
    this.bOpts = bucketOpts;

    this.end = end;
  }

  get candle(): CandleOpts {
    return {
      granularity: this.cOpts.granularity,
      pullNew: this.cOpts.pullNew,
    };
  }

  get bucket(): BucketOpts {
    return {
      candlesPer: this.bOpts.candlesPer,
      total: this.bOpts.total,
    };
  }

  /**
   * Length of a single bucket in milliseconds.
   */
  get bucketLengthMs(): number {
    return this.bucket.candlesPer * this.candle.granularity * 1000;
  }

  /**
   * Length of all buckets in milliseconds.
   */
  get totalLengthMs(): number {
    return this.totalCandleCount * this.candle.granularity * 1000;
  }

  /**
   * Total amount of candles for all buckets.
   */
  get totalCandleCount(): number {
    return this.bucket.candlesPer * this.bucket.total;
  }

  /**
   * Size of a single candle in minutes.
   */
  get candleSizeMin(): number {
    return this.candle.granularity / ONE_MINUTE_TO_S;
  }

  get span(): {start: Date; end: Date} {
    let past = new Date(this.end);
    past.setTime(past.getTime() - this.totalLengthMs);
    const {start, end} = getSpan(past, this.candleSizeMin, new Date(this.end));
    return {start: start, end: end};
  }

  get start(): Date {
    return this.span.start;
  }
}
