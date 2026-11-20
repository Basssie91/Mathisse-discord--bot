// Partneraanvragen: formulier via het ticketmenu, afhandelen in het aanvraagkanaal (alleen adminIds)
const {
  Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const cfg = require('./config');
const anon = require('./anon');
const { load, save, newId, ts } = require('./store');
const { settings } = require('./tickets');

const FILE = 'partners.json';
const field = (id, label, style, max, required, placeholder) => new ActionRowBuilder().addComponents(
  new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(required).setPlaceholder(placeholder),
);

// ---------- Formulier ----------
async function openForm(interaction) {
  const d = load(FILE, {});
  if (Object.values(d).some((r) => r.userId === interaction.user.id && r.status === 'pending')) {
    return interaction.reply({ content: '⏳ Je hebt al een aanvraag lopen. Wacht op de uitslag!', flags: MessageFlags.Ephemeral });
  }
  await interaction.showModal(new ModalBuilder()
    .setCustomId('partner_form')
    .setTitle('🤝 Partner aanvragen')
    .addComponents(
      field('naam', 'Naam van je server', TextInputStyle.Short, 100, true, 'Bijv. Gaming Hub'),
      field('invite', 'Uitnodigingslink (die niet verloopt)', TextInputStyle.Short, 200, true, 'https://discord.gg/...'),
      field('beschrijving', 'Waar gaat je server over?', TextInputStyle.Paragraph, 1000, true, 'Vertel kort wat je server is en waarom je partner wilt worden.'),
    ));
}

async function submit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const name = interaction.fields.getTextInputValue('naam').trim();
  const description = interaction.fields.getTextInputValue('beschrijving').trim();

  let invite;
  try {
    invite = await interaction.client.fetchInvite(interaction.fields.getTextInputValue('invite').trim(), { withCounts: true });
  } catch {
    return interaction.editReply('❌ Die uitnodigingslink werkt niet. Controleer de link en probeer het opnieuw.');
  }
  if (!invite.guild) return interaction.editReply('❌ Dat is geen uitnodiging naar een server.');
  if (invite.guild.id === interaction.guildId) return interaction.editReply('❌ Dat is een uitnodiging naar déze server. 😉');

  const members = invite.memberCount ?? null;
  const expires = invite.expiresTimestamp ?? null;
  const req = {
    id: newId(),
    userId: interaction.user.id,
    guildId: interaction.guildId,
    name,
    description,
    inviteUrl: `https://discord.gg/${invite.code}`,
    realName: invite.guild.name,
    icon: invite.guild.iconURL?.({ size: 256 }) ?? null,
    members,
    status: 'pending',
    createdAt: Date.now(),
  };

  const embed = new EmbedBuilder()
    .setColor('#FEE75C')
    .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle(`🤝  NIEUWE PARTNERAANVRAAG • ${name}`)
    .setDescription(description)
    .addFields(
      { name: '👤 Aangevraagd door', value: `${interaction.user}\n\`${interaction.user.tag}\``, inline: true },
      { name: '🏠 Echte servernaam', value: req.realName, inline: true },
      { name: '👥 Leden', value: members != null ? `${members}` : 'Onbekend', inline: true },
      { name: '🔗 Uitnodiging', value: req.inviteUrl, inline: true },
      { name: '⏳ Verloopt', value: expires ? `⚠️ ${ts(expires)}` : '✅ Nooit', inline: true },
    )
    .setTimestamp();
  if (req.icon) embed.setThumbnail(req.icon);

  try {
    // Naar het aanvraagkanaal; is dat er niet, dan naar de DM van de eigenaar
    const target = (cfg.partnerRequestChannelId && await interaction.client.channels.fetch(cfg.partnerRequestChannelId).catch(() => null))
      || await interaction.client.users.fetch(cfg.ownerId);
    const msg = await target.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`partner_accept:${req.id}`).setLabel('Accepteren').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`partner_deny:${req.id}`).setLabel('Afwijzen').setEmoji('❌').setStyle(ButtonStyle.Danger),
      )],
    });
    req.messageId = msg.id;
  } catch (e) {
    console.warn('[partners] Kon de aanvraag niet plaatsen:', e.message);
    return interaction.editReply('❌ Je aanvraag kon niet worden verstuurd. Probeer het later opnieuw.');
  }

  const d = load(FILE, {});
  d[req.id] = req;
  save(FILE, d);
  await interaction.editReply('✅ Je aanvraag is verstuurd! Je krijgt een DM zodra er een beslissing is genomen.');
  console.log(`[partners] Nieuwe aanvraag van ${interaction.user.tag}: ${name}`);
}

// ---------- Beslissen (alleen Bas en Mathisse) ----------
async function markDone(interaction, req, accepted, extra) {
  // In een DM is het kanaal soms niet in de cache: dan de DM zelf openen
  const dm = interaction.channel ?? await interaction.user.createDM();
  const msg = await dm.messages.fetch(req.messageId).catch(() => null);
  if (!msg) return;
  await msg.edit({
    embeds: [EmbedBuilder.from(msg.embeds[0])
      .setColor(accepted ? '#57F287' : '#ED4245')
      .addFields({ name: accepted ? '✅ Geaccepteerd' : '❌ Afgewezen', value: `door ${anon.mention(interaction.user, 'het beheer')} ${ts(Date.now())}${extra ? `\n${extra}` : ''}` })],
    components: [],
  });
}

async function accept(interaction, reqId) {
  const d = load(FILE, {});
  const req = d[reqId];
  if (!req || req.status !== 'pending') return interaction.reply({ content: 'Deze aanvraag is al afgehandeld.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const s = settings();
  const guild = interaction.client.guilds.cache.get(req.guildId);

  let postUrl = null;
  const channel = guild && s.partnerChannelId ? await guild.channels.fetch(s.partnerChannelId).catch(() => null) : null;
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(cfg.color)
      .setTitle(`🤝  ${req.name}`)
      .setDescription(req.description)
      .addFields(
        ...(req.members != null ? [{ name: '👥 Leden', value: `${req.members}`, inline: true }] : []),
        { name: '🔗 Joinen', value: req.inviteUrl, inline: true },
      )
      .setFooter({ text: `Partner van ${guild.name}` })
      .setTimestamp();
    if (req.icon) embed.setThumbnail(req.icon);
    const post = await channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Join server').setEmoji('🚀').setStyle(ButtonStyle.Link).setURL(req.inviteUrl),
      )],
    });
    postUrl = post.url;
  }

  let gotRole = false;
  if (guild && s.partnerRoleId) {
    const member = await guild.members.fetch(req.userId).catch(() => null);
    gotRole = await member?.roles.add(s.partnerRoleId, 'Partneraanvraag geaccepteerd').then(() => true).catch(() => false) ?? false;
  }

  req.status = 'accepted';
  save(FILE, d);
  await interaction.editReply(`✅ **${req.name}** is geaccepteerd${postUrl ? ` en geplaatst: ${postUrl}` : ' (geen partnerkanaal ingesteld, dus nergens geplaatst)'}.`);
  await markDone(interaction, req, true);

  const user = await interaction.client.users.fetch(req.userId).catch(() => null);
  await user?.send({
    embeds: [new EmbedBuilder().setColor('#57F287')
      .setTitle(`🎉 Je partneraanvraag bij ${guild?.name ?? 'de server'} is geaccepteerd!`)
      .setDescription(`${postUrl ? `**${req.name}** staat nu bij onze partners: ${postUrl}` : `**${req.name}** is nu partner.`}${gotRole ? '\nJe hebt de partner-rol gekregen.' : ''}\nBedankt en welkom als partner! 🤝`)],
  }).catch(() => {});
  console.log(`[partners] ${req.name} geaccepteerd`);
}

async function askDenyReason(interaction, reqId) {
  const req = load(FILE, {})[reqId];
  if (!req || req.status !== 'pending') return interaction.reply({ content: 'Deze aanvraag is al afgehandeld.', flags: MessageFlags.Ephemeral });
  await interaction.showModal(new ModalBuilder()
    .setCustomId(`partner_denyform:${reqId}`)
    .setTitle('❌ Aanvraag afwijzen')
    .addComponents(field('reden', 'Reden (optioneel, ziet de aanvrager)', TextInputStyle.Paragraph, 500, false, 'Bijv. te weinig leden of past niet bij onze server.')));
}

async function deny(interaction, reqId) {
  const d = load(FILE, {});
  const req = d[reqId];
  if (!req || req.status !== 'pending') return interaction.reply({ content: 'Deze aanvraag is al afgehandeld.', flags: MessageFlags.Ephemeral });
  const reason = interaction.fields.getTextInputValue('reden').trim();
  req.status = 'denied';
  req.reason = reason || null;
  save(FILE, d);
  await interaction.reply({ content: '✅ Afgewezen. De aanvrager krijgt een DM.', flags: MessageFlags.Ephemeral });
  await markDone(interaction, req, false, reason ? `**Reden:** ${reason}` : null);

  const guild = interaction.client.guilds.cache.get(req.guildId);
  const user = await interaction.client.users.fetch(req.userId).catch(() => null);
  await user?.send({
    embeds: [new EmbedBuilder().setColor('#ED4245')
      .setTitle(`Je partneraanvraag bij ${guild?.name ?? 'de server'} is afgewezen`)
      .setDescription(`Helaas is **${req.name}** deze keer geen partner geworden.${reason ? `\n\n**Reden:** ${reason}` : ''}\n\nJe mag later opnieuw een aanvraag doen.`)],
  }).catch(() => {});
  console.log(`[partners] ${req.name} afgewezen`);
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    const id = interaction.customId;
    if (!id?.startsWith('partner_')) return;
    try {
      if (interaction.isModalSubmit() && id === 'partner_form') return submit(interaction);
      if (!cfg.adminIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ Alleen de beheerders kunnen partneraanvragen afhandelen.', flags: MessageFlags.Ephemeral });
      }
      const reqId = id.split(':')[1];
      if (interaction.isButton() && id.startsWith('partner_accept:')) return accept(interaction, reqId);
      if (interaction.isButton() && id.startsWith('partner_deny:')) return askDenyReason(interaction, reqId);
      if (interaction.isModalSubmit() && id.startsWith('partner_denyform:')) return deny(interaction, reqId);
    } catch (e) {
      console.error('[partners]', e);
      const m = { content: 'Er ging iets mis. Probeer het opnieuw.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) interaction.followUp(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.openForm = openForm;
