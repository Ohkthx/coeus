import {parseBoolean} from './utils';
import {config as envLoad} from 'dotenv';
import {logger} from './logger';

// Load the environment variables into process.env
envLoad();

export const APP_DEBUG = parseBoolean(process.env.DEBUG!);
export const DB_DATABASE = process.env.DB_DATABASE ?? 'coeus';
export const USE_SANDBOX = parseBoolean(process.env.USE_SANDBOX!);
export const UPDATE_FREQUENCY = Number(process.env.UPDATE_FREQUENCY ?? 5);
export const S_GRANULARITY = Number(process.env.S_GRANULARITY ?? 900);
export const MAX_DAYS_OF_DATA = Number(process.env.MAX_DAYS_OF_DATA ?? 26);

export interface DbCompat {
  _id: string;
  save(): Promise<void>;
  remove(): Promise<void>;
}

// Logger bindings.
export const appLog = (text: string, footer = '\n') =>
  logger('log', 'app', text, footer);
export const appErr = (text: string, footer = '\n') =>
  logger('error', 'app', text, footer);
export const appInfo = (text: string, footer = '\n') =>
  logger('info', 'app', text, footer);
export const appWarn = (text: string, footer = '\n') =>
  logger('warn', 'app', text, footer);
export const appDebug = (text: string, footer = '\n') =>
  logger('debug', 'app', text, footer);
