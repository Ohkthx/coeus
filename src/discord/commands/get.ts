import {
  bold,
  codeBlock,
  CommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import {State} from '../../core';
import {Products} from '../../product';

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
        .setName('product')
        .setDescription('retrieve a product.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Id of the product/pair, ie. BTC-USD')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName('update')
        .setDescription('Gives you the current Update Id.'),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName('filter')
        .setDescription('Gives you the current filter for rank results.'),
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
      case 'product':
        return getProduct(interaction);
      case 'update':
        return getUpdate(interaction);
      case 'filter':
        return getFilter(interaction);
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

function getProduct(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  const opts = interaction.options;
  const productId = opts.getString('id', true) ?? '';
  const product = Products.get(productId.toUpperCase());
  if (productId === '' || !product) {
    return interaction.reply({
      content:
        `Attempted to get an invalid product: ${productId}. ` +
        `Could be disabled, delisted, non-existent, or typo'd.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: codeBlock('json', JSON.stringify(product, null, 2)),
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

function getFilter(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  let filter = JSON.stringify({none: 'no filters'}, null, 2);
  const stateFilter = State.getFilter();
  if (Object.entries(stateFilter).length > 0) {
    filter = JSON.stringify(stateFilter, null, 2);
  }

  return interaction.reply({
    content: codeBlock('json', filter),
    ephemeral: false,
  });
}
