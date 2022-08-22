import {Product as IProduct} from 'coinbase-pro-node';
import mongoose from 'mongoose';

const {Schema, model} = mongoose;

export interface Product extends IProduct {
  useSandbox: boolean;
}

const productSchema = new Schema<Product>(
  {
    id: String,
    useSandbox: Boolean,
    base_currency: String,
    quote_currency: String,
    base_min_size: String,
    base_max_size: String,
    quote_increment: String,
    base_increment: String,
    display_name: String,
    min_market_funds: String,
    max_market_funds: String,
    margin_enabled: Boolean,
    cancel_only: Boolean,
    limit_only: Boolean,
    post_only: Boolean,
    status: String,
    status_message: String,
    trading_disabled: Boolean,
  },
  {collection: 'products'},
);

/**
 * Model that represents a single Product.
 */
export const ProductModel = model<Product>('Product', productSchema);
