import mongoose from 'mongoose';
const {Schema, model} = mongoose;

export interface SimpleCandle {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  openTimeInISO: string;
}

export interface CandleData {
  productId: string;
  useSandbox: boolean;
  candles: SimpleCandle[];
}

const candleSchema = new Schema<CandleData>(
  {
    productId: String,
    useSandbox: Boolean,
    candles: [
      {
        close: Number,
        high: Number,
        low: Number,
        open: Number,
        volume: Number,
        openTimeInISO: String,
      },
    ],
  },
  {collection: 'candles'},
);

/**
 * Model that represents a products candles.
 */
export const CandleDataModel = model<CandleData>('CandleData', candleSchema);
