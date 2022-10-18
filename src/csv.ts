import {Indicators} from './core/indicators';

export interface CsvRow {
  date: string | null;
  close: number | null;
  rsi: number | null;
  macd_value: number | null;
  macd_signal: number | null;
  sma_twelve: number | null;
  sma_twentysix: number | null;
  sma_fifty: number | null;
  sma_twohundred: number | null;
  ema_twelve: number | null;
  ema_twentysix: number | null;
  ema_fifty: number | null;
  ema_twohundred: number | null;
}

function extract(values: number[] | undefined, pos: number): number | null {
  if (values === undefined || values.length === 0) return null;
  const aPos = values.length - 1 - pos;
  if (values[aPos] === undefined) return null;
  return values[aPos];
}

/**
 * Converts indicators to an array for CSV processing.
 */
export function generateIndicatorRows(indicators: Indicators): CsvRow[] {
  const rows: CsvRow[] = [];

  for (let i = 0; i < indicators.dates.length; i++) {
    const row: CsvRow = {
      date: indicators.dates[indicators.dates.length - 1 - i],
      close: extract(indicators.closes, i),
      rsi: extract(indicators.rsi, i),
      macd_value: extract(indicators.macd.value, i),
      macd_signal: extract(indicators.macd.signal, i),
      sma_twelve: extract(indicators.sma.twelve, i),
      sma_twentysix: extract(indicators.sma.twentysix, i),
      sma_fifty: extract(indicators.sma.fifty, i),
      sma_twohundred: extract(indicators.sma.twohundred, i),
      ema_twelve: extract(indicators.ema.twelve, i),
      ema_twentysix: extract(indicators.ema.twentysix, i),
      ema_fifty: extract(indicators.ema.fifty, i),
      ema_twohundred: extract(indicators.ema.twohundred, i),
    };

    rows.push(row);
  }

  return rows.reverse();
}
