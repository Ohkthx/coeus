import {SlashCommandBuilder} from '@discordjs/builders';
import {CommandInteraction} from 'discord.js';
import {LastCommand} from '..';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('last')
    .setDescription('Perform the last command issued.'),

  async execute(interaction: CommandInteraction) {
    const last = LastCommand.get(interaction.user.id);
    if (!last) {
      return interaction.reply({
        content: 'There was not last command performed on this session.',
        ephemeral: true,
      });
    }

    interaction.commandName = last.commandName;
    interaction.options = last.options;

    const parser = require('../events/interaction');
    await parser.execute(interaction);
  },
};
