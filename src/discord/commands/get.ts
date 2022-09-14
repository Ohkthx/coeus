import {
  bold,
  codeBlock,
  CommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import {State} from '../../core';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('get')
    .setDescription('Retrieving info commands.')
    .addSubcommand((subcmd) =>
      subcmd
        .setName('rank')
        .setDescription('retrieve a rank.')
        .addStringOption((option) =>
          option
            .setName('product')
            .setDescription('Id of the product/pair, ie. BTC-USD')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName('update')
        .setDescription('Gives you the current Update Id.'),
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) {
      return interaction.reply({
        content: `This is not a chat input command.`,
        ephemeral: true,
      });
    }

    switch (interaction.options.getSubcommand()) {
      case 'rank':
        return getRank(interaction);
      case 'update':
        return getUpdate(interaction);
      default:
        return interaction.reply({
          content: `Unknown get command.`,
          ephemeral: true,
        });
    }
  },
};

function getRank(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  const opts = interaction.options;
  const productId = opts.getString('product', true) ?? '';
  const rank = State.getRanking(productId.toUpperCase());
  if (productId === '' || !rank) {
    return interaction.reply({
      content:
        `Attempted to get an invalid rank: ${productId}. ` +
        `Could be disabled, delisted, non-existent, or typo'd.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: codeBlock('json', JSON.stringify(rank, null, 2)),
    ephemeral: false,
  });
}

function getUpdate(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: `Update Id: ${bold(State.updateId)}`,
    ephemeral: false,
  });
}
