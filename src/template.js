// /template: alleen in tickets. Opent een formulier met de ticket-templates
// (Thumbnail of Algemene vraag) en zet het ingevulde formulier netjes in het ticket,
// met de naam van degene die het heeft ingevuld.
const {
  Events, SlashCommandBuilder, EmbedBuilder, MessageFlags, ModalBuilder, LabelBuilder,
  TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} = require('discord.js');
const cfg = require('./config');

const command = new SlashCommandBuilder()
  .setName('template')
  .setDescription('Ticket-template invullen (alleen in tickets)')
  .setDMPermission(false)
  .toJSON();

const isTicket = (channel) => /ticket:[a-z]+:\d+/.test(channel?.topic ?? '');
const text = (id, style, placeholder, max) => new TextInputBuilder()
  .setCustomId(id).setStyle(style).setPlaceholder(placeholder).setMaxLength(max).setRequired(false);

function form() {
  return new ModalBuilder()
    .setCustomId('template_form')
    .setTitle('📝 Ticket-template')
    .addLabelComponents(
      new LabelBuilder().setLabel('Welke template?')
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('soort').setRequired(true).addOptions(
          { label: 'Thumbnail', value: 'thumbnail', emoji: '🖼️', description: 'Vul de 3 thumbnail-vragen hieronder in' },
          { label: 'Algemene vraag', value: 'vraag', emoji: '❓', description: 'Vul alleen "Wat is je vraag?" in' },
        )),
      new LabelBuilder().setLabel('🖼️ Wat is je YT-kanaal?').setDescription('Alleen bij Thumbnail')
        .setTextInputComponent(text('kanaal', TextInputStyle.Short, 'Bijv. youtube.com/@naam', 200)),
      new LabelBuilder().setLabel('🖼️ Wat moet er opstaan?').setDescription('Alleen bij Thumbnail')
        .setTextInputComponent(text('opstaan', TextInputStyle.Paragraph, 'Bijv. tekst, personen, kleuren...', 1000)),
      new LabelBuilder().setLabel('🖼️ Ben je crimi of bovenwereld?').setDescription('Alleen bij Thumbnail')
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('wereld').setRequired(false).addOptions(
          { label: 'Crimi', value: 'Crimi', emoji: '🔫' },
          { label: 'Bovenwereld', value: 'Bovenwereld', emoji: '👮' },
        )),
      new LabelBuilder().setLabel('❓ Wat is je vraag?').setDescription('Alleen bij Algemene vraag')
        .setTextInputComponent(text('vraag', TextInputStyle.Paragraph, 'Stel hier je vraag...', 1000)),
    );
}

async function submit(interaction) {
  const soort = interaction.fields.getStringSelectValues('soort')[0];
  const v = (id) => interaction.fields.getTextInputValue(id).trim();
  const wereld = interaction.fields.getStringSelectValues('wereld')?.[0] ?? '';

  const embed = new EmbedBuilder().setColor(cfg.color).setTimestamp()
    .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL({ size: 64 }) });

  if (soort === 'thumbnail') {
    const missing = [!v('kanaal') && 'YT-kanaal', !v('opstaan') && 'wat er op moet staan', !wereld && 'crimi of bovenwereld'].filter(Boolean);
    if (missing.length) {
      return interaction.reply({ content: `❌ Bij **Thumbnail** moet je dit nog invullen: ${missing.join(', ')}. Probeer het opnieuw.`, flags: MessageFlags.Ephemeral });
    }
    embed.setTitle('🖼️  Ticket voor thumbnail').addFields(
      { name: 'Wat is je YT-kanaal?', value: v('kanaal') },
      { name: 'Wat moet er opstaan?', value: v('opstaan') },
      { name: 'Ben je crimi of bovenwereld?', value: wereld },
    );
  } else {
    if (!v('vraag')) return interaction.reply({ content: '❌ Bij **Algemene vraag** moet je je vraag invullen. Probeer het opnieuw.', flags: MessageFlags.Ephemeral });
    embed.setTitle('❓  Ticket voor algemene vraag').addFields({ name: 'Wat is je vraag?', value: v('vraag') });
  }
  embed.addFields({ name: '👤 Ingevuld door', value: `${interaction.user}` });

  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  console.log(`[template] ${interaction.user.tag} vulde ${soort} in, in #${interaction.channel.name}`);
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'template') {
        if (!isTicket(interaction.channel)) {
          return interaction.reply({ content: '❌ `/template` werkt alleen in een ticket.', flags: MessageFlags.Ephemeral });
        }
        return interaction.showModal(form());
      }
      if (interaction.isModalSubmit() && interaction.customId === 'template_form') return submit(interaction);
    } catch (e) {
      console.error('[template]', e);
      const m = { content: '❌ Er ging iets mis met de template.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.followUp(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.command = command;
