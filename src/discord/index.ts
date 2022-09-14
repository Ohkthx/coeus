import {CommandInteraction} from 'discord.js';
import {APP_DEBUG} from '..';
import {logger} from '../logger';

export const separator = '-==- -==- -==- -==- -==- -==- -==- -==-';

export const redmark: string = '<:redmark:887734442406314094>';
export const grnmark: string = '<:greenmark:887731874523402281>';
export const DISCORD_MAX_RANKING: number = 5;

export enum DiscordColor {
  GREEN = '#77b255',
  RED = '#dd2e44',
  NEUTRAL = '',
}

export const discordLog = (text: string, footer = '\n') =>
  logger('log', 'discord', text, footer);
export const discordErr = (text: string, footer = '\n') =>
  logger('error', 'discord', text, footer);
export const discordInfo = (text: string, footer = '\n') =>
  logger('info', 'discord', text, footer);
export const discordWarn = (text: string, footer = '\n') =>
  logger('warn', 'discord', text, footer);
export const discordDebug = (text: string, footer = '\n') =>
  logger('debug', 'discord', text, footer, APP_DEBUG);

// Stores the last command performed by the user.
export const LastCommand: Map<string, CommandInteraction> = new Map();
