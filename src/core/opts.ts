import {ONE_MINUTE_TO_S} from '.';
import {getSpan} from '../timespan';

export interface CandleOpts {
  frequency: number;
  sGranularity: number;
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
    const {sGranularity, frequency} = candleOpts;
    const mGranularity = sGranularity / ONE_MINUTE_TO_S;
    const updateFrequency = frequency * mGranularity;
    if (60 % updateFrequency !== 0) {
      throw new Error(
        `update frequency must be divisible by 60, provided:\n` +
          `  ${mGranularity} granularity in minutes and a frequency of ${frequency}\n` +
          `  resulting in updates every ${updateFrequency} minutes.`,
      );
    }

    this.cOpts = candleOpts;
    this.bOpts = bucketOpts;

    this.end = end;
  }

  /**
   * Returns the current Candle Options.
   *  mUpdateFrequency - Frequency to pull candle data in minutes.
   *  sGranularity - Size of each candle in seconds.
   *  pullNew - Grab new candles when prompted.
   *
   * @returns {CandleOpts} Candle options.
   */
  get candle(): CandleOpts {
    return {
      frequency: this.cOpts.frequency,
      sGranularity: this.cOpts.sGranularity,
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
   * Total amount of candles for all buckets.
   */
  get totalCandleCount(): number {
    return this.bucket.candlesPer * this.bucket.total;
  }

  /**
   * Length of all buckets in milliseconds.
   */
  get msTotalLength(): number {
    return this.totalCandleCount * this.candle.sGranularity * 1000;
  }

  /**
   * Length of a single bucket in milliseconds.
   */
  get msBucketLength(): number {
    return this.bucket.candlesPer * this.candle.sGranularity * 1000;
  }

  /**
   * Size of a single candle in minutes.
   */
  get mCandleSize(): number {
    return this.candle.sGranularity / ONE_MINUTE_TO_S;
  }

  /**
   * How often to update and obtain new candles in minutes.
   */
  get mUpdateFrequency(): number {
    return this.candle.frequency * this.mCandleSize;
  }

  /**
   * Gets a span of time based on the 'start' and 'end' of the options, cleaned.
   */
  get span(): {start: Date; end: Date} {
    let past = new Date(this.end);
    past.setTime(past.getTime() - this.msTotalLength);
    const {start, end} = getSpan(past, this.mCandleSize, new Date(this.end));
    return {start: start, end: end};
  }

  get start(): Date {
    return this.span.start;
  }

  setPullNew(value: boolean) {
    this.cOpts.pullNew = value;
  }

  setEnd(date: Date) {
    this.end = date;
  }
}
