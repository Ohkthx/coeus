import {codeBlock, spoiler} from 'discord.js';
import {DISCORD_MAX_RANKING} from '.';
import {ProductRanking} from '../core/rank';
import {DiscordBot, DISCORD_DEST_RANK} from './discord-bot';

export function createNotification(data: string): string {
  return spoiler(codeBlock('json', data));
}

export const NULL_DATA = JSON.stringify({placeholder: 'No data.'}, null, 2);

export async function sendRankings(
  rankings: ProductRanking[],
  total: number,
  dataPoints: number,
) {
  let rankPos: number = 0;

  for (let i = 0; i < DISCORD_MAX_RANKING; i++) {
    const msgId = DiscordBot.messageIds[i];
    let jsonData = NULL_DATA;
    if (rankPos < rankings.length) {
      jsonData = JSON.stringify(rankings[rankPos++], null, 2);
    }

    const notification = createNotification(jsonData);
    await DiscordBot.editNotification(DISCORD_DEST_RANK, msgId, notification);
  }

  const date = new Date();
  const dpString = dataPoints.toLocaleString('en-US');
  const updateText = codeBlock(
    `Processed ${total} products and ${dpString} candles.\n` +
      `Updated @Local: ${date}\n` +
      `Updated @ISO-8601: ${date.toISOString()}\n` +
      `\n\nNote:\n` +
      `'SMA/EMA' - A value of '-1' indicates there was not enough data to calculate.\n` +
      `'dataPoints' - Amount of candles available and processed.\n` +
      `'ratio' - Close/Diff/Volume Ratios. Last candle data versus the average.\n` +
      `'ratio => rating' - Algorithmic value as to how well it is doing.\n` +
      `'last' - Data from the past 24hrs.\n` +
      `'cv' - Coefficient of Variation`,
  );
  await DiscordBot.editNotification(
    DISCORD_DEST_RANK,
    DiscordBot.messageIds[DiscordBot.messageIds.length - 1],
    updateText,
  );
}
