import {codeBlock, spoiler} from 'discord.js';
import {CLOSE_WEIGHT, DIFF_WEIGHT, State, VOLUME_WEIGHT} from '../core';
import {ProductRanking, SortFilter} from '../core/rank';
import {DiscordBot, DISCORD_OPTS} from './discord-bot';

// Placeholder data.
export const PLACEHOLDER_DATA = JSON.stringify(
  {placeholder: 'No data.'},
  null,
  2,
);

export function getFilterString(filter: SortFilter): string {
  const res: string[] = [];
  if (filter.close) res.push('[close > 1]');
  if (filter.diff) res.push('[diff > 1]');
  if (filter.volume) res.push('[volume > 1]');
  if (filter.movement) res.push('[movement > 1]');

  if (res.length === 0) return '';
  return `Filtered Results! Only showing: ${res.join(' ')}\n`;
}

/**
 * Create a notification, placing it as a spoiler and in code blocks.
 *
 * @param {string} cbSyntax - Syntax to use for the codeblock.
 * @param {string} data - Data to place inside the spoiler and codeblock.
 * @returns {string} Newly formed notification wrapped.
 */
export function createNotification(cbSyntax: string, data: string): string {
  return spoiler(codeBlock(cbSyntax, data));
}

export async function sendAnalysis(data: string[], updateId: string) {
  if (data.length === 0) return;

  const date = new Date();
  data = ['Analysis:'].concat(data);
  const newData = data.join('\n+ ');

  const res =
    `Update Id: ${updateId}\n` +
    `+ Updated @Local: ${date}\n` +
    `+ Updated @ISO-8601: ${date.toISOString()}\n\n` +
    `${newData}`;

  return DiscordBot.sendNotification(
    DISCORD_OPTS.analysis.dest,
    createNotification('markdown', res),
  );
}

/**
 * Sends the current filtered rankings passed to discord.
 *
 * @param {ProductRanking} rankings - Rankings to be sent.
 * @param {number} total - Total amount of unsorted rankings.
 * @param {number} dataPoints - Total amount of candles processed.
 * @param {{id: string, time: number}} update - Current update id and time elapsed.
 */
export async function sendRankings(
  rankings: ProductRanking[],
  total: number,
  dataPoints: number,
  update?: {id: string; time: number},
) {
  let rankPos: number = 0;

  // Post the top DISCORD_OPTS max rankings to discord.
  for (let i = 0; i < DISCORD_OPTS.ranking.max; i++) {
    const msgId = DiscordBot.messageIds[i];
    let jsonData = PLACEHOLDER_DATA;
    if (rankPos < rankings.length) {
      jsonData = JSON.stringify(rankings[rankPos++], null, 2);
    }

    if (update) jsonData = `Update Id: ${update.id}\n${jsonData}`;
    const notification = createNotification('json', jsonData);
    await DiscordBot.editNotification(
      DISCORD_OPTS.ranking.dest,
      msgId,
      notification,
    );
  }

  const date = new Date();
  const dpString = dataPoints.toLocaleString('en-US');
  const filtered = total - rankings.length;
  const filterString = getFilterString(State.getFilter());
  let updateString = '';
  if (update) {
    updateString = `+ UpdateId: ${update.id}, time took: ${update.time}s\n`;
  }

  // Final message to be sent giving information to the current update as a guide.
  const updateText = codeBlock(
    'markdown',
    `Processed ${total} products and ${dpString} candles, filtered ${filtered} rankings.\n` +
      `${filterString}` +
      `${updateString}` +
      `+ Updated @Local: ${date}\n` +
      `+ Updated @ISO-8601: ${date.toISOString()}\n` +
      `\nNotes:\n` +
      `+ Values of '-1' indicate errors, not enough data, or data not calculated.\n` +
      `+ Filtered results: none\n` +
      `\nKey:\n` +
      `+ 'SMA/EMA' - Simple / Exponential Moving Averages.\n` +
      `+ 'dataPoints' - Amount of candles available and processed.\n` +
      `+ 'movement' - Amount of buying versus selling orders currently present for top 50 orders. \n` +
      `+ 'ratio' - Close/Diff/Volume Ratios. Last candle data versus the daily average.\n` +
      `+ 'ratio => rating' - Calculated by applying WEIGHTS on the ratios.\n` +
      `+ 'ratio => WEIGHTS'   ` +
      `Close: ${CLOSE_WEIGHT * 100}%, ` +
      `Diff: ${DIFF_WEIGHT * 100}%, ` +
      `Volume: ${VOLUME_WEIGHT * 100}%\n` +
      `+ 'last' - Data from the past 24hrs.\n` +
      `+ 'last => cov' - Coefficient of Variations.\n`,
  );

  return DiscordBot.editNotification(
    DISCORD_OPTS.ranking.dest,
    DiscordBot.messageIds[DiscordBot.messageIds.length - 1],
    updateText,
  );
}
