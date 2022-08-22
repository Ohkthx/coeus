import mongoose from 'mongoose';
import {ProductData} from '../core';

const {Schema, model} = mongoose;

const productSchema = new Schema<ProductData>(
  {
    productId: String,
    useSandbox: Boolean,
    bucketData: [
      {
        timestampISO: String,
        priceAvg: Number,
        priceLow: Number,
        priceHigh: Number,
        priceClose: Number,
        volume: Number,
        closeStd: Number,
        diffStd: Number,
        volumeStd: Number,
      },
    ],
  },
  {collection: 'dynamicData'},
);

/**
 * Model that represents a single Product Data.
 */
export const ProductDataModel = model<ProductData>(
  'ProductData',
  productSchema,
);
