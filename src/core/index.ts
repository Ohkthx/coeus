import {APP_DEBUG} from '..';
import {logger} from '../logger';

// Event name(s)
export const DYNAMIC_EVENT_NAME: string = 'updates';

// Weights used to modify rankings.
export const CLOSE_WEIGHT: number = 0.5;
export const VOLUME_WEIGHT: number = 0.15;
export const DIFF_WEIGHT: number = 0.35;

export const dynamicLog = (text: string, footer = '\n') =>
  logger('log', 'dynamic', text, footer);
export const dynamicErr = (text: string, footer = '\n') =>
  logger('error', 'dynamic', text, footer);
export const dynamicInfo = (text: string, footer = '\n') =>
  logger('info', 'dynamic', text, footer);
export const dynamicWarn = (text: string, footer = '\n') =>
  logger('warn', 'dynamic', text, footer);
export const dynamicDebug = (text: string, footer = '\n') =>
  logger('debug', 'dynamic', text, footer, APP_DEBUG);

export * from './bucket';
export * from './timespan';
export * from './state';
