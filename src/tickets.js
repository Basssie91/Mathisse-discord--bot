const path = require('node:path');
const {
  Events, ChannelType, PermissionFlagsBits: P, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const cfg = require('./config');
const store = require('./store');
const { buildTranscript } = require('./transcript');

const BANNER_FILE = 'banner.png';
const BANNER_PATH = path.join(__dirname, '..', 'assets', BANNER_FILE);
const PANEL_TITLE = '🎫  SUPPORT TICKETS';

// Instellingen staan in src/config.js
const settings = () => cfg;
const typeById = (id) => cfg.types.find((t) => t.id === id);

// Rol-id's die een soort ticket kunnen zien
function teamRoles(type) {
  const s = settings();
  return (type.team ?? []).map((t) => (t === 'staff' ? s.staffRoleId : s.bestuurRoleId)).filter(Boolean);
}
const isTeam = (member, type) => member.permissions.has(P.Administrator)
  || (cfg.superUserIds ?? []).includes(member.id)
  || member.roles.cache.some((r) => teamRoles(type).includes(r.id));

// ---------- Categorie ----------
// Eigen categorie van een soort ticket (uit config), anders de algemene ticketcategorie
async function getCategory(guild, type) {
  await guild.channels.fetch();
  if (type?.categoryId) {
    const own = guild.channels.cache.get(type.categoryId);
    if (own?.type === ChannelType.GuildCategory) return own;
    console.warn(`[tickets] ${type.categoryId} (${type.label}) is geen categorie, ik gebruik ${cfg.categoryName}`);
  }
  const s = settings();
  let cat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === cfg.categoryName);
  if (!cat) {
    cat = await guild.channels.create({
      name: cfg.categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
        { id: guild.members.me.id, allow: [P.ViewChannel, P.ManageChannels] },
        ...[s.staffRoleId, s.bestuurRoleId, ...(cfg.superUserIds ?? [])].filter(Boolean).map((id) => ({ id, allow: [P.ViewChannel] })),
      ],
    });
  }
  return cat;
}

// ---------- Paneel ----------
async function postPanel(guild) {
  const s = settings();
  const channel = await guild.channels.fetch(s.panelChannelId);

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(PANEL_TITLE)
    .setDescription([
      'Hulp nodig of iets te regelen? Kies hieronder een onderwerp in het menu.',
      '',
      '❓ **Vragen** • Een vraag aan het team',
      '👑 **Bestuur** • Zaken voor het bestuur',
      '🛡️ **Staff sollicitatie** • Solliciteren voor het team',
      '🤝 **Partner aanvraag** • Partner worden met je server',
    ].join('\n'))
    .addFields({ name: '📌 Let op', value: '• Eén ticket per onderwerp tegelijk\n• Wees duidelijk en geduldig\n• Misbruik = geen tickets meer' })
    .setImage(`attachment://${BANNER_FILE}`)
    .setFooter({ text: `${guild.name} • Support` });
  if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('🎫 Kies een onderwerp…')
      .addOptions(cfg.types.map((t) => ({ label: t.label, value: t.id, description: t.description, emoji: t.emoji }))),
  );
  const payload = {
    embeds: [embed],
    components: [row],
    files: [new AttachmentBuilder(BANNER_PATH, { name: BANNER_FILE })],
  };

  // Bestaand paneel van de bot bijwerken i.p.v. een tweede plaatsen; staat het er niet meer, opnieuw plaatsen
  const panel = store.load('panel.json', {});
  let old = panel.messageId && panel.channelId === channel.id
    ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;
  if (!old) {
    const recent = await channel.messages.fetch({ limit: 50 });
    old = recent.find((m) => m.author.id === guild.members.me.id && m.embeds[0]?.title === PANEL_TITLE) ?? null;
  }
  let result = 'bijgewerkt';
  if (old) await old.edit({ ...payload, attachments: [] });
  else { old = await channel.send(payload); result = 'opnieuw geplaatst'; }
  store.save('panel.json', { guildId: guild.id, channelId: channel.id, messageId: old.id });
  return result;
}

// ---------- Ticket openen ----------
async function openModal(interaction, type) {
  await interaction.showModal(new ModalBuilder()
    .setCustomId(`ticket_modal:${type.id}`)
    .setTitle(`${type.label} ticket`)
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reden').setLabel('Waar gaat je ticket over?')
        .setStyle(TextInputStyle.Paragraph).setPlaceholder('Beschrijf zo duidelijk mogelijk je vraag...')
        .setMinLength(5).setMaxLength(1000).setRequired(true),
    )));
}

async function createTicket(interaction, type) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { guild, user } = interaction;
  const reason = interaction.fields.getTextInputValue('reden');
  const category = await getCategory(guild, type);

  const tag = `ticket:${type.id}:${user.id}`;
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.topic?.includes(tag));
  if (existing) return interaction.editReply(`Je hebt al een open **${type.label}** ticket: ${existing}`);

  const roles = teamRoles(type);
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'lid';
  const channel = await guild.channels.create({
    name: `${type.id}-${safeName}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `${type.emoji} ${type.label} ticket van ${user.tag} | ${tag}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ReadMessageHistory, P.EmbedLinks, P.AttachFiles] },
      { id: user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
      ...roles.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.ManageMessages] })),
      // Altijd toegang tot elk ticket
      ...(cfg.superUserIds ?? []).filter((id) => id !== user.id)
        .map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.ManageMessages] })),
    ],
  });

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle(`${type.emoji}  ${type.label} ticket`)
    .setDescription([
      `Hey ${user}, bedankt voor je ticket! 👋`,
      '',
      '**⏳ Wat kun je verwachten?**',
      'Het team helpt je zo snel mogelijk. Beschrijf je vraag zo duidelijk mogelijk, eventueel met screenshots.',
    ].join('\n'))
    .addFields(
      { name: '👤 Van', value: `${user}`, inline: true },
      { name: '🕒 Geopend', value: `<t:${Math.floor(Date.now() / 1000)}:t>`, inline: true },
      { name: '📝 Onderwerp', value: reason.slice(0, 1024) },
    )
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .setFooter({ text: '🙋 Oppakken (team) • 🔒 Sluiten' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Oppakken').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Sluiten').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );
  await channel.send({
    content: `${user} ${roles.map((id) => `<@&${id}>`).join(' ')}`,
    embeds: [embed],
    components: [row],
    allowedMentions: { users: [user.id], roles },
  });
  await interaction.editReply(`✅ Je ticket is aangemaakt: ${channel}`);
  console.log(`[tickets] ${user.tag} opende een ${type.label} ticket`);
}

function ticketInfo(channel) {
  const m = channel.topic?.match(/ticket:([a-z]+):(\d+)/);
  return m ? { type: typeById(m[1]), userId: m[2] } : null;
}

// ---------- Knoppen in een ticket ----------
async function claim(interaction) {
  const info = ticketInfo(interaction.channel);
  if (!info?.type) return;
  if (!isTeam(interaction.member, info.type)) {
    return interaction.reply({ content: 'Alleen het team kan een ticket oppakken.', flags: MessageFlags.Ephemeral });
  }
  const row = ActionRowBuilder.from(interaction.message.components[0]);
  row.components[0].setDisabled(true).setLabel(`Opgepakt door ${interaction.member.displayName}`.slice(0, 80));
  await interaction.update({ components: [row] });
  if (!interaction.channel.name.startsWith('✅')) {
    interaction.channel.setName(`✅${interaction.channel.name}`.slice(0, 100), 'Ticket opgepakt').catch(() => {});
  }
  await interaction.channel.send(`🙋 ${interaction.user} heeft dit ticket opgepakt en helpt je verder.`);
}

async function askClose(interaction) {
  const info = ticketInfo(interaction.channel);
  if (!info?.type) return;
  if (interaction.user.id !== info.userId && !isTeam(interaction.member, info.type)) {
    return interaction.reply({ content: 'Je kunt dit ticket niet sluiten.', flags: MessageFlags.Ephemeral });
  }
  await interaction.reply({
    content: 'Weet je zeker dat je dit ticket wilt sluiten?',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close_yes').setLabel('Ja, sluiten').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_close_no').setLabel('Annuleren').setStyle(ButtonStyle.Secondary),
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function askCloseReason(interaction) {
  await interaction.showModal(new ModalBuilder()
    .setCustomId('ticket_close_modal')
    .setTitle('🔒 Ticket sluiten')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reden').setLabel('Waarom sluit je dit ticket?')
        .setPlaceholder('Bijv. Vraag beantwoord').setStyle(TextInputStyle.Short)
        .setMinLength(2).setMaxLength(200).setRequired(true),
    )));
}

async function doClose(interaction) {
  const reason = interaction.fields.getTextInputValue('reden').trim();
  const closing = { content: '🔒 Ticket wordt gesloten...', components: [] };
  if (interaction.isFromMessage?.()) await interaction.update(closing);
  else await interaction.reply({ ...closing, flags: MessageFlags.Ephemeral });

  const { channel, user } = interaction;
  const { guild } = channel;
  await channel.send({
    embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(`🔒 Ticket gesloten door ${user}.\n**Reden:** ${reason}\n\nTranscript wordt gemaakt, het kanaal wordt daarna verwijderd.`)],
    allowedMentions: { parse: [] },
  });
  console.log(`[tickets] ${user.tag} sloot ${channel.name} (${reason})`);

  try {
    const info = ticketInfo(channel);
    const type = info?.type;
    const opener = info ? await channel.client.users.fetch(info.userId).catch(() => null) : null;
    const first = (await channel.messages.fetch({ after: '0', limit: 1 }).catch(() => null))?.first();
    const subject = first?.embeds[0]?.fields?.find((f) => f.name.includes('Onderwerp'))?.value;
    const typeLabel = type ? `${type.emoji} ${type.label}` : 'Onbekend';
    const { html, count } = await buildTranscript(channel, {
      subject, type: typeLabel, opener: opener?.tag ?? 'Onbekend', closer: user.tag, reason,
    });
    const file = () => new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `transcript-${channel.name}.html` });
    // Download-knop: geeft bij elke klik een verse link (Discord laat bestandslinks na een tijd verlopen)
    const downloadRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('transcript_dl').setLabel('Download transcript').setEmoji('📥').setStyle(ButtonStyle.Secondary),
    );

    const s = settings();
    const log = s.transcriptChannelId ? await guild.channels.fetch(s.transcriptChannelId).catch(() => null) : null;
    if (log) {
      await log.send({
        embeds: [new EmbedBuilder()
          .setColor(cfg.color)
          .setTitle(`🧾  TICKET GESLOTEN • ${channel.name}`)
          .addFields(
            { name: '🏷️ Soort', value: typeLabel, inline: true },
            { name: '👤 Geopend door', value: opener ? `${opener}` : 'Onbekend', inline: true },
            { name: '🔒 Gesloten door', value: `${user}`, inline: true },
            { name: '💬 Berichten', value: `${count}`, inline: true },
            { name: '🕒 Geopend', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:f>`, inline: true },
            { name: '🔒 Reden van sluiten', value: reason.slice(0, 1024) },
          )
          .setFooter({ text: 'Open het bestand in je browser om het hele gesprek te lezen.' })
          .setTimestamp()],
        files: [file()],
        components: [downloadRow()],
        allowedMentions: { parse: [] },
      });
    }
    if (opener) {
      await opener.send({
        embeds: [new EmbedBuilder()
          .setColor(cfg.color)
          .setTitle(`🧾 Je ticket in ${guild.name} is gesloten`)
          .setDescription(`Je **${type?.label ?? ''}** ticket is gesloten door **${interaction.member.displayName}**.\n🔒 **Reden:** ${reason}\n\nIn de bijlage vind je het hele gesprek. Bedankt voor je bericht! 💙`)
          .setTimestamp()],
        files: [file()],
        components: [downloadRow()],
      }).catch(() => console.log(`[tickets] Kon ${opener.tag} geen DM sturen`));
    }
  } catch (e) {
    console.warn('[tickets] Kon transcript niet maken:', e.message);
  }
  setTimeout(() => channel.delete('Ticket gesloten').catch(() => {}), 3000);
}

// Zoekt de server via het paneelkanaal en zet het paneel neer
async function checkPanel(client) {
  const s = settings();
  if (!s.panelChannelId) return console.log('[tickets] Geen paneelkanaal: vul panelChannelId in src/config.js in');
  try {
    const channel = await client.channels.fetch(s.panelChannelId);
    console.log(`[tickets] Ticketpaneel ${await postPanel(channel.guild)}`);
  } catch (e) {
    console.warn('[tickets] Kon paneel niet controleren:', e.message);
  }
}

// ---------- Koppelen ----------
module.exports = (client) => {
  // Bij elke start het paneel bijwerken (als het systeem is ingesteld)
  // Bij elke start: controleren of het paneel er nog staat (anders opnieuw plaatsen)
  client.once(Events.ClientReady, () => checkPanel(client));

  // Paneel verwijderd? Meteen opnieuw plaatsen
  client.on(Events.MessageDelete, (message) => {
    if (message.id === store.load('panel.json', {}).messageId) {
      console.log('[tickets] Ticketpaneel is verwijderd, ik plaats het opnieuw');
      setTimeout(() => checkPanel(client), 2000);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton() && interaction.customId === 'transcript_dl') {
        const att = interaction.message?.attachments?.find((a) => a.name?.endsWith('.html'));
        await interaction.reply({
          content: att ? `📥 **[Klik hier om de transcript te downloaden](${att.url})**\nOpen het bestand daarna in je browser.` : '❌ Ik kan het bestand niet meer vinden.',
          flags: MessageFlags.Ephemeral,
        });
      } else if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
        const id = interaction.values[0];
        if (id === 'staff') await require('./applications').openForm(interaction);
        else if (id === 'partner') await require('./partners').openForm(interaction);
        else if (typeById(id)) await openModal(interaction, typeById(id));
        // Menu weer leeg maken, zodat je opnieuw kunt kiezen
        interaction.message.edit({ components: interaction.message.components }).catch(() => {});
      } else if (interaction.isButton()) {
        const id = interaction.customId;
        if (id === 'ticket_claim') await claim(interaction);
        else if (id === 'ticket_close') await askClose(interaction);
        else if (id === 'ticket_close_yes') await askCloseReason(interaction);
        else if (id === 'ticket_close_no') await interaction.update({ content: 'Oké, het ticket blijft open.', components: [] });
      } else if (interaction.isModalSubmit() && interaction.customId === 'ticket_close_modal') {
        await doClose(interaction);
      } else if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal:')) {
        const type = typeById(interaction.customId.split(':')[1]);
        if (type) await createTicket(interaction, type);
      }
    } catch (e) {
      console.error('[tickets]', e);
      const msg = { content: 'Er ging iets mis met het ticket. Probeer het opnieuw.', flags: MessageFlags.Ephemeral };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch { /* niks */ }
    }
  });
};
module.exports.settings = settings;
