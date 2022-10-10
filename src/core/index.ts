import {APP_DEBUG} from '..';
import {logger} from '../logger';

export const ONE_DAY_TO_S: number = 86400;
export const ONE_HOUR_TO_S: number = 3600;
export const ONE_MINUTE_TO_S: number = 60;

// Weights used to modify rankings.
export const CLOSE_WEIGHT: number = 0.5;
export const VOLUME_WEIGHT: number = 0.15;
export const DIFF_WEIGHT: number = 0.35;

export const coreLog = (text: string, footer = '\n') =>
  logger('log', 'core', text, footer);
export const coreErr = (text: string, footer = '\n') =>
  logger('error', 'core', text, footer);
export const coreInfo = (text: string, footer = '\n') =>
  logger('info', 'core', text, footer);
export const coreWarn = (text: string, footer = '\n') =>
  logger('warn', 'core', text, footer);
export const coreDebug = (text: string, footer = '\n') =>
  logger('debug', 'core', text, footer, APP_DEBUG);

export * from './bucket';
export * from './state';
export * from './candle';
