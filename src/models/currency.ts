import {Currency as ICurrency} from 'coinbase-pro-node';
import mongoose from 'mongoose';

const {Schema, model} = mongoose;

export interface Currency extends ICurrency {
  useSandbox: boolean;
}

const currencySchema = new Schema<Currency>(
  {
    id: String,
    name: String,
    useSandbox: Boolean,
    min_size: String,
    max_precision: String,
    status: String,
  },
  {collection: 'currencies'},
);

/**
 * Model that represents a single Currency.
 */
export const CurrencyModel = model<Currency>('Currency', currencySchema);
