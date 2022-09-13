import {codeBlock, spoiler} from 'discord.js';
import {DISCORD_MAX_RANKING} from '.';
import {CLOSE_WEIGHT, DIFF_WEIGHT, VOLUME_WEIGHT} from '../core';
import {ProductRanking} from '../core/rank';
import {getUniqueId} from '../utils';
import {
  DiscordBot,
  DISCORD_DEST_ANALYSIS,
  DISCORD_DEST_RANK,
} from './discord-bot';

export function createNotification(cbValue: string, data: string): string {
  return spoiler(codeBlock(cbValue, data));
}

export const NULL_DATA = JSON.stringify({placeholder: 'No data.'}, null, 2);

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

  await DiscordBot.sendNotification(
    DISCORD_DEST_ANALYSIS,
    createNotification('markdown', res),
  );
}

export async function sendRankings(
  rankings: ProductRanking[],
  total: number,
  dataPoints: number,
  updateId: string,
) {
  let rankPos: number = 0;

  for (let i = 0; i < DISCORD_MAX_RANKING; i++) {
    const msgId = DiscordBot.messageIds[i];
    let jsonData = NULL_DATA;
    if (rankPos < rankings.length) {
      jsonData =
        `Update ID: ${updateId}\n` +
        `${JSON.stringify(rankings[rankPos++], null, 2)}`;
    }

    const notification = createNotification('json', jsonData);
    await DiscordBot.editNotification(DISCORD_DEST_RANK, msgId, notification);
  }

  const date = new Date();
  const dpString = dataPoints.toLocaleString('en-US');
  const filtered = total - rankings.length;
  const updateText = codeBlock(
    'markdown',
    `Processed ${total} products and ${dpString} candles, filtered ${filtered} rankings.\n` +
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
  await DiscordBot.editNotification(
    DISCORD_DEST_RANK,
    DiscordBot.messageIds[DiscordBot.messageIds.length - 1],
    updateText,
  );
}
