import {SlashCommandBuilder} from '@discordjs/builders';
import {CommandInteraction} from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),

  async execute(interaction: CommandInteraction) {
    const latency = new Date().getTime() - interaction.createdTimestamp;
    return interaction.reply({
      content: `Pong! Latency: ${latency}ms.`,
      ephemeral: true,
    });
  },
};
