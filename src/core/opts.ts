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
   * @param {Date} end - Final timestamp to end candle span, should be most recent.
   * @param {CandleOpts} candleOpts - Options for processing candles.
   * @param {BucketOpts} bucketOpts - Options for processing buckets.
   */
  constructor(end: Date, candleOpts: CandleOpts, bucketOpts: BucketOpts) {
    this.cOpts = candleOpts;
    this.bOpts = bucketOpts;

    this.end = end;
  }

  /**
   * Returns the current Candle Options.
   *
   * @returns {CandleOpts} Candle options.
   */
  get candle(): CandleOpts {
    return {
      granularity: this.cOpts.granularity,
      pullNew: this.cOpts.pullNew,
    };
  }

  /**
   * Returns the current Bucket Options.
   *
   * @returns {BucketOpts} Bucket options.
   */
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

  /**
   * Gets a span of time based on the 'start' and 'end' of the options, cleaned.
   */
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
