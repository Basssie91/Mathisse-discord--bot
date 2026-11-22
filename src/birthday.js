// Verjaardagen
//  /verjaardag        → formulier (dag, maand, optioneel geboortejaar). Kan maar één keer.
//  /resetverjaardag   → staff wist iemands verjaardag, zodat hij hem opnieuw kan invullen.
// Op iemands verjaardag (vanaf 09:00 Nederlandse tijd) feliciteert de bot in het verjaardagskanaal
// en krijgt de jarige de rol "🎂 Jarig" (de bot maakt die rol zelf aan, zonder rechten). De dag erna gaat de rol weer weg.
// Vul je je verjaardag in op de dag zelf, dan krijg je meteen een felicitatie.
const {
  Events, SlashCommandBuilder, EmbedBuilder, MessageFlags, ModalBuilder, LabelBuilder,
  TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const FILE = 'birthdays.json';
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const load = () => store.load(FILE, { users: {}, announced: {} });

const isStaff = (m) => cfg.adminIds.includes(m.id) || (cfg.superUserIds ?? []).includes(m.id)
  || m.roles.cache.some((r) => [cfg.staffRoleId, cfg.bestuurRoleId].includes(r.id));

const command = new SlashCommandBuilder()
  .setName('verjaardag')
  .setDescription('Je verjaardag invullen (kan maar één keer)')
  .setDMPermission(false)
  .toJSON();
const resetCommand = new SlashCommandBuilder()
  .setName('resetverjaardag')
  .setDescription('Iemands verjaardag wissen, zodat hij hem opnieuw kan invullen (staff)')
  .addUserOption((o) => o.setName('lid').setDescription('Wiens verjaardag?').setRequired(true))
  .setDMPermission(false)
  .toJSON();

// Datum in Nederland: { day, month, year, hour }
function nlNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hour12: false,
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: +parts.day, month: +parts.month, year: +parts.year, hour: +parts.hour % 24 };
}
const pretty = (b) => `${b.day} ${MONTHS[b.month - 1]}${b.year ? ` ${b.year}` : ''}`;
const validDate = (d, m, y) => {
  const date = new Date(Date.UTC(y ?? 2000, m - 1, d)); // 2000 is een schrikkeljaar, dus 29 februari mag
  return date.getUTCDate() === d && date.getUTCMonth() === m - 1;
};

function form() {
  return new ModalBuilder()
    .setCustomId('bday_form')
    .setTitle('🎂 Je verjaardag')
    .addLabelComponents(
      new LabelBuilder().setLabel('Dag').setDescription('Een getal van 1 tot 31')
        .setTextInputComponent(new TextInputBuilder().setCustomId('dag').setStyle(TextInputStyle.Short)
          .setPlaceholder('Bijv. 14').setMinLength(1).setMaxLength(2).setRequired(true)),
      new LabelBuilder().setLabel('Maand')
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('maand').setRequired(true)
          .addOptions(MONTHS.map((m, i) => ({ label: m[0].toUpperCase() + m.slice(1), value: String(i + 1) })))),
      new LabelBuilder().setLabel('Geboortejaar (optioneel)').setDescription('Vul je het in, dan zet de bot je nieuwe leeftijd erbij')
        .setTextInputComponent(new TextInputBuilder().setCustomId('jaar').setStyle(TextInputStyle.Short)
          .setPlaceholder('Bijv. 2009').setMinLength(4).setMaxLength(4).setRequired(false)),
    );
}

async function submit(interaction) {
  const d = load();
  if (d.users[interaction.user.id]) {
    return interaction.reply({ content: `🎂 Je verjaardag staat al op **${pretty(d.users[interaction.user.id])}**. Klopt dat niet? Vraag het team om hem te resetten.`, flags: MessageFlags.Ephemeral });
  }
  const day = Number(interaction.fields.getTextInputValue('dag').trim());
  const month = Number(interaction.fields.getStringSelectValues('maand')[0]);
  const yearText = interaction.fields.getTextInputValue('jaar').trim();
  const year = yearText ? Number(yearText) : null;
  const thisYear = nlNow().year;

  if (!Number.isInteger(day) || !validDate(day, month, year)) {
    return interaction.reply({ content: '❌ Die datum bestaat niet. Controleer de dag en probeer het opnieuw met `/verjaardag`.', flags: MessageFlags.Ephemeral });
  }
  if (year !== null && (!Number.isInteger(year) || year < thisYear - 100 || year > thisYear - 5)) {
    return interaction.reply({ content: '❌ Dat geboortejaar klopt niet. Probeer het opnieuw met `/verjaardag`.', flags: MessageFlags.Ephemeral });
  }

  d.users[interaction.user.id] = { day, month, year, setAt: Date.now() };
  store.save(FILE, d);
  console.log(`[verjaardag] ${interaction.user.tag} vulde zijn verjaardag in`);
  const today = isToday(d.users[interaction.user.id], nlNow());
  await interaction.reply({
    content: today
      ? `🎂 Opgeslagen: **${pretty(d.users[interaction.user.id])}**. Hé, dat is vandaag! Gefeliciteerd! 🎉`
      : `🎂 Opgeslagen: **${pretty(d.users[interaction.user.id])}**! Op je verjaardag krijg je een felicitatie.\n-# Je kunt dit maar één keer invullen. Klopt het niet? Vraag het team om een reset.`,
    flags: MessageFlags.Ephemeral,
  });
  // Vandaag jarig? Meteen feliciteren (ook vóór 09:00)
  if (today) check(interaction.client, { force: true }).catch(() => {});
}

async function reset(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Alleen het team kan verjaardagen resetten.', flags: MessageFlags.Ephemeral });
  }
  const user = interaction.options.getUser('lid');
  const d = load();
  if (!d.users[user.id]) return interaction.reply({ content: `ℹ️ ${user} heeft nog geen verjaardag ingevuld.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  const old = pretty(d.users[user.id]);
  delete d.users[user.id];
  store.save(FILE, d);
  console.log(`[verjaardag] ${interaction.user.tag} resette de verjaardag van ${user.tag}`);
  await interaction.reply({ content: `✅ De verjaardag van ${user} (**${old}**) is gewist. Hij kan hem nu opnieuw invullen met \`/verjaardag\`.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

// Rol "🎂 Jarig" (wordt aangemaakt als hij er nog niet is)
const ROLE_NAME = '🎂 Jarig';
async function ensureRole(guild) {
  const d = load();
  let role = d.roleId && (guild.roles.cache.get(d.roleId) ?? await guild.roles.fetch(d.roleId).catch(() => null));
  if (!role) role = guild.roles.cache.find((r) => r.name === ROLE_NAME);
  if (!role) {
    role = await guild.roles.create({
      name: ROLE_NAME, color: '#FF73FA', hoist: true, permissions: [],
      ...(guild.premiumTier >= 2 ? { unicodeEmoji: '🎂' } : {}),
      reason: 'Verjaardagsrol',
    });
    console.log('[verjaardag] Rol 🎂 Jarig aangemaakt');
  }
  if (d.roleId !== role.id) { d.roleId = role.id; store.save(FILE, d); }
  return role;
}

// Is deze verjaardag vandaag? (29 februari telt in een jaar zonder 29 februari op 28 februari)
function isToday(b, now) {
  if (b.month === now.month && b.day === now.day) return true;
  const isLeapYear = new Date(Date.UTC(now.year, 1, 29)).getUTCMonth() === 1;
  return !isLeapYear && b.month === 2 && b.day === 29 && now.month === 2 && now.day === 28;
}

// Elke 10 minuten: is het vandaag iemands verjaardag (en is het na 09:00)? Dan feliciteren.
async function check(client, { force = false } = {}) {
  if (!cfg.birthdayChannelId) return;
  const now = nlNow();
  const channel = await client.channels.fetch(cfg.birthdayChannelId).catch(() => null);
  if (!channel) return console.warn('[verjaardag] Verjaardagskanaal niet gevonden');
  const { guild } = channel;
  const role = await ensureRole(guild).catch((e) => console.warn('[verjaardag] Rol:', e.message));
  const d = load();
  const todayKey = `${now.year}-${now.month}-${now.day}`;

  // Rol weghalen bij wie niet (meer) jarig is
  if (role) {
    for (const m of role.members.values()) {
      const b = d.users[m.id];
      if (!b || !isToday(b, now)) await m.roles.remove(role, 'Niet meer jarig').catch(() => {});
    }
  }
  if (now.hour < 9 && !force) return;

  const jarig = Object.entries(d.users).filter(([id, b]) => d.announced[id] !== todayKey && isToday(b, now));
  for (const [id, b] of jarig) {
    const member = await guild.members.fetch(id).catch(() => null);
    d.announced[id] = todayKey;
    store.save(FILE, d);
    if (!member) continue; // niet meer in de server
    if (role) await member.roles.add(role, 'Jarig!').catch((e) => console.warn('[verjaardag] Rol geven mislukt:', e.message));
    const age = b.year ? now.year - b.year : null;
    await channel.send({
      content: `🎉 ${member}`,
      embeds: [new EmbedBuilder()
        .setColor(cfg.color)
        .setTitle(`🎂  Gefeliciteerd, ${member.displayName}!`)
        .setDescription(`Vandaag is ${member} jarig${age ? ` en wordt **${age} jaar**` : ''}! 🥳\nVan harte gefeliciteerd namens iedereen in **${guild.name}**! 🎈🎁`)
        .setThumbnail(member.displayAvatarURL({ size: 256 }))],
      allowedMentions: { users: [id] },
    }).catch((e) => console.warn('[verjaardag] Felicitatie mislukt:', e.message));
    console.log(`[verjaardag] ${member.user.tag} gefeliciteerd`);
  }
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => {
    check(client);
    setInterval(() => check(client), 10 * 60 * 1000).unref();
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'verjaardag') {
        const b = load().users[interaction.user.id];
        if (b) return interaction.reply({ content: `🎂 Je verjaardag staat al op **${pretty(b)}**. Klopt dat niet? Vraag het team om hem te resetten.`, flags: MessageFlags.Ephemeral });
        return interaction.showModal(form());
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'resetverjaardag') return reset(interaction);
      if (interaction.isModalSubmit() && interaction.customId === 'bday_form') return submit(interaction);
    } catch (e) {
      console.error('[verjaardag]', e);
      const m = { content: '❌ Er ging iets mis.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.followUp(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.command = command;
module.exports.resetCommand = resetCommand;
module.exports._test = { validDate, nlNow, pretty };
