import {Client} from 'discord.js';
import {discordInfo} from '..';
import {DiscordBot} from '../discord-bot';

module.exports = {
  name: 'ready',
  once: true,
  execute(client: Client<true>) {
    discordInfo(`Ready! Logged in as ${client.user.tag}`);
    DiscordBot.setReady(true);
  },
};
