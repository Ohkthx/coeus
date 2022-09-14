import {SlashCommandBuilder} from '@discordjs/builders';
import {codeBlock, CommandInteraction} from 'discord.js';
import {State} from '../../core';
import {SortFilter} from '../../core/rank';

const DISCORD_ADMIN: string = process.env.DISCORD_ADMIN ?? '';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administrative commands.')
    .addSubcommand((subcmd) =>
      subcmd
        .setName('filter')
        .setDescription('retrieve information')
        .addBooleanOption((option) =>
          option
            .setName('movement')
            .setDescription(
              'Show only movements where more buying than selling.',
            )
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('close')
            .setDescription('Sort on close ratio > 1.')
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('volume')
            .setDescription('Sort on volume ratio > 1.')
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('diff')
            .setDescription('Sort on diff ratio > 1.')
            .setRequired(false),
        ),
    ),

  async execute(interaction: CommandInteraction) {
    const isAdmin = interaction.user.id === DISCORD_ADMIN;

    if (!isAdmin) {
      return interaction.reply({
        content: `You are not an admin and cannot perform any commands.`,
        ephemeral: true,
      });
    }

    if (!interaction.isChatInputCommand()) {
      return interaction.reply({
        content: `This is not a chat input command.`,
        ephemeral: true,
      });
    }

    switch (interaction.options.getSubcommand()) {
      case 'filter':
        return filter(interaction);
      default:
        return interaction.reply({
          content: `Unknown admin commands.`,
          ephemeral: true,
        });
    }
  },
};

async function filter(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  const opts = interaction.options;
  let newFilter: SortFilter = {
    movement: opts.getBoolean('movement', false) ?? undefined,
    close: opts.getBoolean('close', false) ?? undefined,
    diff: opts.getBoolean('diff', false) ?? undefined,
    volume: opts.getBoolean('volume', false) ?? undefined,
  };

  newFilter = State.updateFilter(newFilter);
  const newFilterJSON = JSON.stringify(newFilter, null, 2);
  return interaction.reply({
    content: `New filter:\n${codeBlock('json', newFilterJSON)}`,
    ephemeral: false,
  });
}
