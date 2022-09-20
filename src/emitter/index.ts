import {logger} from '../logger';
import {DEFAULT_REST_PORT} from '../rest';

export const DEFAULT_EMIT_PORT = DEFAULT_REST_PORT + 1;

// Logger stuff.
export const emitLog = (text: string, footer = '\n') =>
  logger('log', 'emit-server', text, footer);
export const emitErr = (text: string, footer = '\n') =>
  logger('error', 'emit-server', text, footer);
export const emitInfo = (text: string, footer = '\n') =>
  logger('info', 'emit-server', text, footer);
export const emitWarn = (text: string, footer = '\n') =>
  logger('warn', 'emit-server', text, footer);
export const emitDebug = (text: string, footer = '\n') =>
  logger('debug', 'emit-server', text, footer);

export * from './server';
