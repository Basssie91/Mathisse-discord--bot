// /commands: overzicht van wat je in de server kunt doen.
// Alleen de dingen voor leden; commands voor team en beheer staan er bewust niet in.
const { Events, SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const cfg = require('./config');

const command = new SlashCommandBuilder()
  .setName('commands')
  .setDescription('Bekijk alle commands en wat je in de server kunt doen')
  .setDMPermission(false)
  .toJSON();

const ch = (id) => (id ? `<#${id}>` : null);

// Klikbare commandlink (</naam:id>), anders gewone tekst
function cmd(client, name) {
  const c = client.application?.commands.cache.find((x) => x.name === name);
  return c ? `</${name}:${c.id}>` : `\`/${name}\``;
}

function build(interaction) {
  const { client, guild } = interaction;

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle('📖  COMMANDS & FUNCTIES')
    .setDescription('Dit kun je allemaal doen in de server:')
    .addFields(
      {
        name: '⌨️ Commands voor iedereen',
        value: `${cmd(client, 'commands')} • Dit overzicht`,
      },
      {
        name: '🎫 Tickets',
        value: [
          `Hulp nodig? Kies een onderwerp in het menu in ${ch(cfg.panelChannelId) ?? 'het ticketkanaal'}:`,
          '❓ Vragen • 👑 Bestuur • 🖼️ Thumbnail • 🛡️ Staff sollicitatie • 🤝 Partner aanvraag',
        ].join('\n'),
      },
      {
        name: '🎮 Spellen',
        value: [
          ch(cfg.wordChainChannelId) && `🔤 **Woordketting** in ${ch(cfg.wordChainChannelId)}: begin met de laatste letter van het vorige woord`,
          ch(cfg.countingChannelId) && `🔢 **Tellen** in ${ch(cfg.countingChannelId)}: stuur steeds het volgende getal`,
        ].filter(Boolean).join('\n') || 'Binnenkort meer!',
      },
      {
        name: '🎁 Giveaways',
        value: `Doe mee met één klik op **🎉 Meedoen**${ch(cfg.giveawayChannelId) ? ` in ${ch(cfg.giveawayChannelId)}` : ''}`,
      },
      ...(ch(cfg.selfRolesChannelId) ? [{ name: '🔔 Meldingen', value: `Kies zelf je meldingsrollen in ${ch(cfg.selfRolesChannelId)}` }] : []),
      ...(ch(cfg.suggestionChannelId) ? [{ name: '💡 Suggesties', value: `Heb je een idee? Dien het in via de knop in ${ch(cfg.suggestionChannelId)} en stem op andere ideeën` }] : []),
      ...(ch(cfg.rulesChannelId) ? [{ name: '📜 Regels', value: `Lees de regels in ${ch(cfg.rulesChannelId)}` }] : []),
    )
    .setFooter({ text: `Veel plezier in ${guild.name}!` });

  return embed;
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'commands') return;
    try {
      if (!client.application.commands.cache.size) await client.application.commands.fetch().catch(() => {});
      await interaction.reply({ embeds: [build(interaction)], flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('[commands]', e);
      interaction.reply({ content: '❌ Er ging iets mis.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
};
module.exports.command = command;
