// /commands: overzicht van wat je in de server kunt doen.
// Iedereen ziet de algemene dingen; wie meer mag, ziet ook de commands voor team/beheer.
const { Events, SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const cfg = require('./config');

const command = new SlashCommandBuilder()
  .setName('commands')
  .setDescription('Bekijk alle commands en wat je in de server kunt doen')
  .setDMPermission(false)
  .toJSON();

const ch = (id) => (id ? `<#${id}>` : null);
const hasRole = (member, ids = []) => member.roles.cache.some((r) => ids.includes(r.id));

// Klikbare commandlink (</naam:id>), anders gewone tekst
function cmd(client, name) {
  const c = client.application?.commands.cache.find((x) => x.name === name);
  return c ? `</${name}:${c.id}>` : `\`/${name}\``;
}

function build(interaction) {
  const { member, client, guild } = interaction;
  const isAdmin = cfg.adminIds.includes(member.id);
  const canPurge = isAdmin || cfg.purgeUserIds.includes(member.id) || hasRole(member, cfg.purgeRoleIds);
  const canGiveaway = isAdmin || hasRole(member, cfg.giveawayRoleIds);
  const canStaffUpdate = isAdmin || hasRole(member, cfg.staffUpdateRoleIds);

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
          '❓ Vragen • 👑 Bestuur • 🛡️ Staff sollicitatie • 🤝 Partner aanvraag',
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
      ...(ch(cfg.rulesChannelId) ? [{ name: '📜 Regels', value: `Lees de regels in ${ch(cfg.rulesChannelId)}` }] : []),
    )
    .setFooter({ text: 'Je ziet alleen de commands die jij kunt gebruiken' });

  const team = [
    canPurge && `${cmd(client, 'opruimen')} • Berichten verwijderen`,
    canGiveaway && `${cmd(client, 'giveaway')} • Een giveaway starten`,
    canStaffUpdate && `${cmd(client, 'staff-update')} • Aanname, promotie, degradatie of ontslag plaatsen`,
  ].filter(Boolean);
  if (team.length) embed.addFields({ name: '🛡️ Voor het team', value: team.join('\n') });

  if (isAdmin) {
    embed.addFields({
      name: '👑 Voor beheerders',
      value: [
        `${cmd(client, 'changelog')} • Changelog bekijken en publiceren`,
        `${cmd(client, 'content')} • YouTuber of streamer toevoegen`,
        `${cmd(client, 'content-lijst')} • Contentmeldingen bekijken en verwijderen`,
        `${cmd(client, 'verlengen')} • Status van de verlenging bij Bot-Hosting`,
        `${cmd(client, 'restart')} • De bot herstarten`,
      ].join('\n'),
    });
  }
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
