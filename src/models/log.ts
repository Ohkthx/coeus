import mongoose from 'mongoose';

const {Schema, model} = mongoose;

export interface LogSchema {
  _id: string;
  type: string;
  item: string;
  message: string;
  created: string;
}

const logSchema = new Schema<LogSchema>(
  {
    _id: String,
    type: String,
    item: String,
    message: String,
    created: String,
  },
  {collection: 'logs'},
);

/**
 * Model that represents a single Log.
 */
export const LogModel = model<LogSchema>('Log', logSchema);
