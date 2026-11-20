// /opruimen: berichten in een kanaal verwijderen
const { Events, SlashCommandBuilder, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const cfg = require('./config');

const command = new SlashCommandBuilder()
  .setName('opruimen')
  .setDescription('Berichten in dit kanaal verwijderen')
  .addIntegerOption((o) => o.setName('aantal').setDescription('Hoeveel berichten (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
  .addUserOption((o) => o.setName('gebruiker').setDescription('Alleen berichten van deze persoon (optioneel)'))
  .setDMPermission(false)
  .toJSON();

// Mag deze persoon /opruimen gebruiken?
const allowed = (member) => cfg.purgeUserIds.includes(member.id)
  || member.roles.cache.some((r) => cfg.purgeRoleIds.includes(r.id));

async function purge(interaction) {
  if (!allowed(interaction.member)) {
    return interaction.reply({ content: '❌ Je hebt geen toestemming om dit te gebruiken.', flags: MessageFlags.Ephemeral });
  }
  const { channel } = interaction;
  if (!channel.permissionsFor(interaction.guild.members.me).has([P.ManageMessages, P.ReadMessageHistory])) {
    return interaction.reply({ content: '❌ Ik heb in dit kanaal geen recht om berichten te beheren.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const amount = interaction.options.getInteger('aantal');
  const user = interaction.options.getUser('gebruiker');

  let messages = await channel.messages.fetch({ limit: 100 });
  if (user) messages = messages.filter((m) => m.author.id === user.id);
  messages = [...messages.values()].slice(0, amount);

  // Discord verwijdert in één keer alleen berichten jonger dan 14 dagen
  const deleted = await channel.bulkDelete(messages, true);
  const skipped = messages.length - deleted.size;
  await interaction.editReply([
    `🧹 **${deleted.size}** bericht${deleted.size === 1 ? '' : 'en'} verwijderd${user ? ` van ${user}` : ''}.`,
    skipped ? `⚠️ ${skipped} bericht${skipped === 1 ? ' was' : 'en waren'} ouder dan 14 dagen en kon${skipped === 1 ? '' : 'den'} niet verwijderd worden.` : null,
  ].filter(Boolean).join('\n'));
  console.log(`[opruimen] ${interaction.user.tag} verwijderde ${deleted.size} berichten in #${channel.name}`);
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'opruimen') return;
    try {
      await purge(interaction);
    } catch (e) {
      console.error('[opruimen]', e);
      const m = { content: `❌ Opruimen mislukt: ${e.message}`, flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.editReply(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.command = command;
