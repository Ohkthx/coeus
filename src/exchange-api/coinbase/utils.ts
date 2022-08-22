import {Candle, CandleGranularity} from 'coinbase-pro-node';
import {AnonymousClient} from './anonymous_client';

function smooth(range: number): number {
  return 2 / (range + 1);
}

function ema(
  tIndex: number,
  range: number,
  data: number[],
): number | undefined {
  if (!data[tIndex - 1] || tIndex - range < 0) return undefined;
  const k = smooth(range);

  const price = data[tIndex];
  const yEMA = ema(tIndex - 1, range, data) || data[tIndex - 1];

  return (price - yEMA) * k + yEMA;
}

/**
 * Get the EMA-(N), N being days, of a product/pair, using ONE HOUR candles.
 *
 * @param {string} productId - A string representing a product/pair.
 * @param {number} days - Amount of days of the period of time.
 * @param {string} endISO - Timestamp to finish at.
 * @param {number} decimals - Decimal places to round the number to.
 * @returns {Promise<number>} EMA-(N) value if product exists, -1 if not.
 */
export async function getEMA(
  productId: string,
  days: number,
  endISO: string = '',
): Promise<number> {
  let endDate = new Date();
  if (endISO !== '') {
    endDate = new Date(endISO);
  }

  const startDate = new Date(endDate.getTime());
  startDate.setDate(startDate.getDate() - days);

  const candles: Candle[] = await AnonymousClient.getCandles(
    productId,
    CandleGranularity.ONE_HOUR,
    endDate,
    startDate,
  );

  const closes: number[] = candles.map((c) => c.close);
  return ema(closes.length - 1, days, closes) ?? -1;
}
