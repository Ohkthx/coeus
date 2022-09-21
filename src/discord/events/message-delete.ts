import {Message} from 'discord.js';
import {discordErr} from '..';
import {DiscordBot, DISCORD_OPTS} from '../discord-bot';
import {createNotification, PLACEHOLDER_DATA} from '../notification';

/**
 * Called when the guildMessageDelete event happens, attempts to fix if  a protected
 * message is deleted.
 */
module.exports = {
  name: 'messageDelete',
  async execute(message: Message) {
    try {
      const msgIds = [...DiscordBot.messageIds];
      const index = msgIds.findIndex((m) => m === message.id);
      if (index < 0) return;

      discordErr(`protected message deleted, recreating.`);

      // Message deleted, need to remove and recreate.
      msgIds.splice(index, 1);
      const newMsg = createNotification('json', PLACEHOLDER_DATA, true);
      const msg = await DiscordBot.sendNotification(
        DISCORD_OPTS.ranking.dest,
        newMsg,
      );

      if (msg) msgIds.push(msg.id);
      DISCORD_OPTS.ranking.messages = msgIds;

      await DiscordBot.saveConfig();
    } catch (err) {
      discordErr(`Could not process message deletion.`);
    }
  },
};
