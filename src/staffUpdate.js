// /staff-update: formulier (persoon, soort update, rol, reden) → bericht in het staff-updatekanaal
// Opmaak:
//   ✅ | @persoon
//   **Aangenomen** ➜ @Rol
//   -# Uitgeschreven door: @jij
const {
  Events, SlashCommandBuilder, MessageFlags, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder,
} = require('discord.js');
const cfg = require('./config');
const anon = require('./anon');

const TYPES = {
  aangenomen: { label: 'Aangenomen', emoji: '✅', needsRole: true },
  promotie: { label: 'Promotie', emoji: '⏫', needsRole: true },
  degraderen: { label: 'Gedegradeerd', emoji: '⏬', needsRole: true },
  ontslagen: { label: 'Ontslagen', emoji: '❌', needsRole: false },
};

const command = new SlashCommandBuilder()
  .setName('staff-update')
  .setDescription('Een staff-update plaatsen (je krijgt een formulier)')
  .setDMPermission(false)
  .toJSON();

const allowed = (member) => cfg.adminIds.includes(member.id)
  || member.roles.cache.some((r) => (cfg.staffUpdateRoleIds ?? []).includes(r.id));

function form() {
  return new ModalBuilder()
    .setCustomId('staffupdate_form')
    .setTitle('📋 Staff-update')
    .addLabelComponents(
      new LabelBuilder().setLabel('Persoon')
        .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId('persoon').setRequired(true).setMaxValues(1)),
      new LabelBuilder().setLabel('Soort update')
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('soort').setRequired(true).addOptions(
          { label: 'Aangenomen', value: 'aangenomen', emoji: '✅' },
          { label: 'Ontslagen', value: 'ontslagen', emoji: '❌' },
          { label: 'Promotie', value: 'promotie', emoji: '⏫' },
          { label: 'Degraderen', value: 'degraderen', emoji: '⏬' },
        )),
      new LabelBuilder().setLabel('Rol').setDescription('Nodig bij Aangenomen, Promotie en Degraderen')
        .setRoleSelectMenuComponent(new RoleSelectMenuBuilder().setCustomId('rol').setRequired(false).setMaxValues(1)),
      new LabelBuilder().setLabel('Reden').setDescription('Optioneel (bij Ontslagen staat anders "Geen reden opgegeven")')
        .setTextInputComponent(new TextInputBuilder().setCustomId('reden').setStyle(TextInputStyle.Short)
          .setMaxLength(200).setRequired(false)),
    );
}

async function submit(interaction) {
  if (!allowed(interaction.member)) {
    return interaction.reply({ content: '❌ Je hebt geen toestemming om staff-updates te plaatsen.', flags: MessageFlags.Ephemeral });
  }
  const user = interaction.fields.getSelectedUsers('persoon')?.first();
  const key = interaction.fields.getStringSelectValues('soort')[0];
  const type = TYPES[key];
  let role = null;
  try { role = interaction.fields.getSelectedRoles('rol')?.first() ?? null; } catch { role = null; }
  const reason = interaction.fields.getTextInputValue('reden').trim();

  if (!user || !type) return interaction.reply({ content: '❌ Kies een persoon en een soort update.', flags: MessageFlags.Ephemeral });
  if (type.needsRole && !role) {
    return interaction.reply({ content: `❌ Bij **${type.label}** moet je een rol kiezen. Probeer het opnieuw.`, flags: MessageFlags.Ephemeral });
  }

  const channel = await interaction.client.channels.fetch(cfg.staffUpdateChannelId).catch(() => null);
  if (!channel) return interaction.reply({ content: '❌ Ik kan het staff-updatekanaal niet vinden.', flags: MessageFlags.Ephemeral });

  const detail = key === 'ontslagen'
    ? `Reden: ${reason || 'Geen reden opgegeven'}`
    : `${role}${reason ? ` • Reden: ${reason}` : ''}`;
  const msg = await channel.send({
    content: [
      `${type.emoji} | ${user}`,
      `**${type.label}** ➜ ${detail}`,
      `-# Uitgeschreven door: ${anon.mention(interaction.user, 'het beheer')}`,
    ].join('\n'),
    allowedMentions: { parse: [] }, // namen en rollen zonder iemand te pingen
  });
  await interaction.reply({ content: `✅ Staff-update geplaatst: ${msg.url}`, flags: MessageFlags.Ephemeral });
  console.log(`[staff-update] ${interaction.user.tag}: ${type.label} ${user.tag}${role ? ` (${role.name})` : ''}`);
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'staff-update') {
        if (!allowed(interaction.member)) {
          return interaction.reply({ content: '❌ Je hebt geen toestemming om staff-updates te plaatsen.', flags: MessageFlags.Ephemeral });
        }
        return interaction.showModal(form());
      }
      if (interaction.isModalSubmit() && interaction.customId === 'staffupdate_form') return submit(interaction);
    } catch (e) {
      console.error('[staff-update]', e);
      const m = { content: '❌ Er ging iets mis met de staff-update.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.followUp(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.command = command;
