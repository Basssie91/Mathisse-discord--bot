// Staff-sollicitaties: formulier via het ticketmenu, afhandelen in het sollicitatiekanaal (alleen adminIds)
const {
  Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle, RoleSelectMenuBuilder,
} = require('discord.js');
const cfg = require('./config');
const anon = require('./anon');
const { load, save, newId, ts } = require('./store');

const FILE = 'applications.json';
const DAY = 24 * 60 * 60 * 1000;

// ---------- Formulier ----------
async function openForm(interaction) {
  const d = load(FILE, {});
  const mine = Object.values(d).filter((a) => a.userId === interaction.user.id);
  if (mine.some((a) => a.status === 'pending')) {
    return interaction.reply({ content: '⏳ Je hebt al een sollicitatie lopen. Wacht rustig op de uitslag!', flags: MessageFlags.Ephemeral });
  }
  const lastDenied = Math.max(0, ...mine.filter((a) => a.status === 'denied').map((a) => a.deniedAt ?? 0));
  const again = lastDenied + cfg.cooldownDays * DAY;
  if (lastDenied && Date.now() < again) {
    return interaction.reply({ content: `⏳ Je bent kort geleden afgewezen. Je kunt opnieuw solliciteren op ${ts(again, 'F')} (${ts(again)}).`, flags: MessageFlags.Ephemeral });
  }
  await interaction.showModal(new ModalBuilder()
    .setCustomId('app_form')
    .setTitle('🛡️ Solliciteren voor staff')
    .addComponents(cfg.questions.map((q) => new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(q.id).setLabel(q.label.slice(0, 45))
        .setStyle(q.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setMaxLength(q.style === 'short' ? 100 : 1000).setRequired(q.required),
    ))));
}

async function submit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const answers = Object.fromEntries(cfg.questions.map((q) => [q.id, interaction.fields.getTextInputValue(q.id).trim()]));
  const id = newId();
  const m = interaction.member;

  const embed = new EmbedBuilder()
    .setColor('#FEE75C')
    .setAuthor({ name: `${m.displayName} • ${interaction.guild.name}`, iconURL: interaction.user.displayAvatarURL({ size: 64 }) })
    .setTitle('🛡️  NIEUWE STAFF-SOLLICITATIE')
    .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '👤 Wie', value: `${interaction.user}\n\`${interaction.user.tag}\``, inline: true },
      { name: '📅 Lid sinds', value: m.joinedTimestamp ? ts(m.joinedTimestamp) : '?', inline: true },
      { name: '🗓️ Account', value: ts(interaction.user.createdTimestamp), inline: true },
      ...cfg.questions.filter((q) => answers[q.id]).map((q) => ({ name: `❓ ${q.label}`, value: answers[q.id].slice(0, 1024) })),
    )
    .setTimestamp();

  let msg;
  try {
    // Naar het sollicitatiekanaal; is dat er niet, dan naar de DM van de eigenaar
    const target = (cfg.applicationChannelId && await interaction.client.channels.fetch(cfg.applicationChannelId).catch(() => null))
      || await interaction.client.users.fetch(cfg.ownerId);
    msg = await target.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app_accept:${id}`).setLabel('Accepteren').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`app_deny:${id}`).setLabel('Afwijzen').setEmoji('❌').setStyle(ButtonStyle.Danger),
      )],
    });
  } catch (e) {
    console.warn('[sollicitatie] Kon de sollicitatie niet plaatsen:', e.message);
    return interaction.editReply('❌ Je sollicitatie kon niet worden verstuurd. Probeer het later opnieuw.');
  }

  const d = load(FILE, {});
  d[id] = { userId: interaction.user.id, guildId: interaction.guildId, status: 'pending', messageId: msg.id, createdAt: Date.now() };
  save(FILE, d);
  await interaction.editReply('✅ Je sollicitatie is verstuurd! Je krijgt een DM zodra er een beslissing is genomen. Succes! 🍀');
  console.log(`[sollicitatie] Nieuwe sollicitatie van ${interaction.user.tag}`);
}

// ---------- Afhandelen (alleen Bas en Mathisse) ----------

async function markDone(interaction, app, accepted, extra) {
  // In een DM is het kanaal soms niet in de cache: dan de DM zelf openen
  const dm = interaction.channel ?? await interaction.user.createDM();
  const msg = await dm.messages.fetch(app.messageId).catch(() => null);
  if (!msg) return;
  await msg.edit({
    embeds: [EmbedBuilder.from(msg.embeds[0])
      .setColor(accepted ? '#57F287' : '#ED4245')
      .setTitle(accepted ? '✅  SOLLICITATIE GEACCEPTEERD' : '❌  SOLLICITATIE AFGEWEZEN')
      .addFields({ name: accepted ? '✅ Geaccepteerd' : '❌ Afgewezen', value: `door ${anon.mention(interaction.user, 'het beheer')} ${ts(Date.now())}${extra ? `\n${extra}` : ''}` })],
    components: [],
  });
}

async function onAccept(interaction, id) {
  const app = load(FILE, {})[id];
  if (!app || app.status !== 'pending') return interaction.reply({ content: 'Deze sollicitatie is al afgehandeld.', flags: MessageFlags.Ephemeral });
  // Zelf een rol kiezen uit de rollen van de server
  await interaction.reply({
    content: `Welke rol geef je aan <@${app.userId}>?`,
    components: [new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId(`app_role:${id}`).setPlaceholder('Kies een rol...'),
    )],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function giveRole(interaction, id, roleId) {
  const d = load(FILE, {});
  const app = d[id];
  const done = (content) => (interaction.isRoleSelectMenu() ? interaction.update({ content, components: [] }) : interaction.reply({ content, flags: MessageFlags.Ephemeral }));
  if (!app || app.status !== 'pending') return done('Deze sollicitatie is al afgehandeld.');
  const guild = interaction.client.guilds.cache.get(app.guildId);
  const role = guild?.roles.cache.get(roleId);
  const member = guild ? await guild.members.fetch(app.userId).catch(() => null) : null;
  if (!role) return done('❌ Die rol bestaat niet meer.');
  if (role.managed || role.id === guild.id) return done('❌ Die rol kan niet gegeven worden. Kies een andere rol.');
  if (role.position >= guild.members.me.roles.highest.position) {
    return done(`❌ **${role.name}** staat hoger dan of gelijk aan de rol van de bot. Zet de rol van de bot hoger en probeer het opnieuw.`);
  }
  if (!member) return done('❌ Deze persoon zit niet meer in de server.');
  try {
    await member.roles.add(role, 'Staff-sollicitatie geaccepteerd');
  } catch (e) {
    return done(`❌ Kon de rol niet geven: ${e.message}\nStaat de rol van de bot hoger dan **${role.name}**?`);
  }
  app.status = 'accepted';
  app.roleId = roleId;
  save(FILE, d);
  await done(`✅ ${member.user.tag} is aangenomen als **${role.name}**!`);
  await markDone(interaction, app, true, `🏷️ Rol: ${role.name}`);
  await member.send({
    embeds: [new EmbedBuilder().setColor('#57F287')
      .setTitle(`🎉 Je bent aangenomen bij ${guild.name}!`)
      .setDescription(`Gefeliciteerd! Je sollicitatie is geaccepteerd en je bent nu **${role.name}**.\nWelkom in het team! 💙`)],
  }).catch(() => {});
  console.log(`[sollicitatie] ${member.user.tag} aangenomen als ${role.name}`);
}

async function onDeny(interaction, id) {
  const app = load(FILE, {})[id];
  if (!app || app.status !== 'pending') return interaction.reply({ content: 'Deze sollicitatie is al afgehandeld.', flags: MessageFlags.Ephemeral });
  await interaction.showModal(new ModalBuilder()
    .setCustomId(`app_denyform:${id}`)
    .setTitle('❌ Sollicitatie afwijzen')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reden').setLabel('Reden (optioneel, ziet de sollicitant)')
        .setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false),
    )));
}

async function onDenySubmit(interaction, id) {
  const d = load(FILE, {});
  const app = d[id];
  if (!app || app.status !== 'pending') return interaction.reply({ content: 'Deze sollicitatie is al afgehandeld.', flags: MessageFlags.Ephemeral });
  const reason = interaction.fields.getTextInputValue('reden').trim();
  app.status = 'denied';
  app.reason = reason || null;
  app.deniedAt = Date.now();
  save(FILE, d);
  await interaction.reply({ content: '✅ Afgewezen. De sollicitant krijgt een DM.', flags: MessageFlags.Ephemeral });
  await markDone(interaction, app, false, reason ? `📝 Reden: ${reason}` : null);

  const guild = interaction.client.guilds.cache.get(app.guildId);
  const again = app.deniedAt + cfg.cooldownDays * DAY;
  const user = await interaction.client.users.fetch(app.userId).catch(() => null);
  await user?.send({
    embeds: [new EmbedBuilder().setColor('#ED4245')
      .setTitle(`Je staff-sollicitatie bij ${guild?.name ?? 'de server'}`)
      .setDescription([
        'Helaas ben je deze keer niet aangenomen.',
        reason ? `\n**Reden:** ${reason}` : null,
        `\n⏳ **Je kunt opnieuw solliciteren vanaf ${ts(again, 'F')}** (${ts(again)}).`,
        'Bedankt voor je interesse! 💙',
      ].filter(Boolean).join('\n'))],
  }).catch(() => {});
  console.log(`[sollicitatie] Sollicitatie van ${user?.tag ?? app.userId} afgewezen`);
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    const id = interaction.customId;
    if (!id?.startsWith('app_')) return;
    try {
      if (interaction.isModalSubmit() && id === 'app_form') return submit(interaction);
      if (!cfg.adminIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ Alleen de beheerders kunnen sollicitaties afhandelen.', flags: MessageFlags.Ephemeral });
      }
      const appId = id.split(':')[1];
      if (interaction.isButton() && id.startsWith('app_accept:')) return onAccept(interaction, appId);
      if (interaction.isButton() && id.startsWith('app_deny:')) return onDeny(interaction, appId);
      if (interaction.isRoleSelectMenu() && id.startsWith('app_role:')) return giveRole(interaction, appId, interaction.values[0]);
      if (interaction.isModalSubmit() && id.startsWith('app_denyform:')) return onDenySubmit(interaction, appId);
    } catch (e) {
      console.error('[sollicitatie]', e);
      const m = { content: 'Er ging iets mis. Probeer het opnieuw.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) interaction.followUp(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.openForm = openForm;
