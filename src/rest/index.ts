import {Command} from '../commands';
import {logger} from '../logger';

export const DEFAULT_REST_HOSTNAME = 'localhost';
export const DEFAULT_REST_PORT = 26387;
export const DEFAULT_REST_URI = `http://${DEFAULT_REST_HOSTNAME}:${DEFAULT_REST_PORT}`;

export interface POSTRequest {
  payload: Command;
}

// Logger stuff.
export const restLog = (text: string, footer = '\n') =>
  logger('log', 'rest-server', text, footer);
export const restErr = (text: string, footer = '\n') =>
  logger('error', 'rest-server', text, footer);
export const restInfo = (text: string, footer = '\n') =>
  logger('info', 'rest-server', text, footer);
export const restWarn = (text: string, footer = '\n') =>
  logger('warn', 'rest-server', text, footer);
export const restDebug = (text: string, footer = '\n') =>
  logger('debug', 'rest-server', text, footer);

export * from './server';
