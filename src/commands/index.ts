import {logger} from '../logger';

export const COMMANDS_CURRENT_VERSION = 1;
export const COMMANDS_FILE_NAME = 'commands.json';

export interface Command {
  name: string;
  params: string[];
  dataObj: string;
  isEnabled: boolean;
  description: string[];
  usage: string;
  created: string;
  v: number;
}

export interface Event {
  name: string;
  execute: (command: Command) => Promise<Response>;
}

export interface Response {
  code: number;
  message: string;
  data: object;
  created: string;
}

export function newResponse(
  code: number,
  msg: string,
  data?: object,
): Response {
  return {
    code: code,
    message: msg,
    data: data ?? {},
    created: new Date().toISOString(),
  };
}

// Logger stuff.
export const consoleLog = (text: string, footer = '\n') =>
  logger('log', 'console', text, footer);
export const consoleErr = (text: string, footer = '\n') =>
  logger('error', 'console', text, footer);
export const consoleInfo = (text: string, footer = '\n') =>
  logger('info', 'console', text, footer);
export const consoleWarn = (text: string, footer = '\n') =>
  logger('warn', 'console', text, footer);
export const consoleDebug = (text: string, footer = '\n') =>
  logger('debug', 'console', text, footer);

export * from './state';
