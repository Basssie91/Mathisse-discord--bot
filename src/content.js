// Contentmeldingen (zoals Pingcord): nieuwe YouTube-video's en livestreams op Twitch en Kick.
// /content opent een formulier (link; de rol 📡 Content wordt altijd getagd)  •  /content-lijst: overzicht en verwijderen
// Werkt zonder API-sleutels:
//  - YouTube: openbare RSS-feed van het kanaal
//  - Twitch: decapi.me (uptime / titel / game)
//  - Kick:   openbare kanaal-API van kick.com (kan soms geblokkeerd worden)
const {
  Events, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const cfg = require('./config');
const { load, save, newId } = require('./store');

const FILE = 'content.json';
const CHECK_EVERY = 3 * 60 * 1000; // elke 3 minuten controleren
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8', Cookie: 'SOCS=CAI; CONSENT=YES+1' };
const PLATFORM = {
  youtube: { label: 'YouTube', emoji: '📺', color: '#FF0000' },
  twitch: { label: 'Twitch', emoji: '🟣', color: '#9146FF' },
  kick: { label: 'Kick', emoji: '🟢', color: '#53FC18' },
};

const list = () => load(FILE, []);
const store = (l) => save(FILE, l);
const isAdmin = (user) => cfg.adminIds.includes(user.id);
const decode = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function get(url, type = 'text') {
  const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return type === 'json' ? res.json() : res.text();
}

// ---------- Link herkennen ----------
function parseLink(input) {
  let url;
  try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (['youtube.com', 'youtu.be'].includes(host)) return { platform: 'youtube', url: url.href };
  if (host === 'twitch.tv' && parts[0]) return { platform: 'twitch', handle: parts[0].toLowerCase() };
  if (host === 'kick.com' && parts[0]) return { platform: 'kick', handle: parts[0].toLowerCase() };
  return null;
}

// ---------- YouTube ----------
async function youtubeFeed(channelId) {
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const name = decode(xml.match(/<author>\s*<name>([^<]*)<\/name>/)?.[1]);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: e.match(/<yt:videoId>([^<]+)</)?.[1],
    title: decode(e.match(/<title>([^<]*)<\/title>/)?.[1]),
    published: Date.parse(e.match(/<published>([^<]+)</)?.[1] ?? 0),
  })).filter((e) => e.id);
  return { name, entries };
}

async function resolveYoutube(link) {
  let channelId = link.url.match(/\/channel\/(UC[\w-]{22})/)?.[1];
  if (!channelId) {
    const html = await get(link.url);
    channelId = html.match(/"externalId":"(UC[\w-]{22})"/)?.[1]
      ?? html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1]
      ?? html.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  }
  if (!channelId) throw new Error('Ik kan dit YouTube-kanaal niet vinden. Gebruik de link van het kanaal, bijv. youtube.com/@naam');
  const feed = await youtubeFeed(channelId);
  return {
    platform: 'youtube', channelId, name: feed.name || channelId,
    url: `https://www.youtube.com/channel/${channelId}`,
    seen: feed.entries.map((e) => e.id).slice(0, 30), // bestaande video's niet melden
  };
}

// ---------- Twitch ----------
async function twitchStatus(handle) {
  const uptime = (await get(`https://decapi.me/twitch/uptime/${handle}`)).trim();
  if (/offline/i.test(uptime)) return { live: false };
  if (/not found|error|invalid/i.test(uptime)) throw new Error(uptime);
  const [title, game] = await Promise.all([
    get(`https://decapi.me/twitch/title/${handle}`).catch(() => ''),
    get(`https://decapi.me/twitch/game/${handle}`).catch(() => ''),
  ]);
  return { live: true, title: title.trim(), game: game.trim() };
}

async function resolveTwitch(link) {
  const s = await twitchStatus(link.handle); // gooit een fout als het kanaal niet bestaat
  return { platform: 'twitch', handle: link.handle, name: link.handle, url: `https://www.twitch.tv/${link.handle}`, live: s.live };
}

// ---------- Kick ----------
async function kickStatus(handle) {
  const data = await get(`https://kick.com/api/v2/channels/${handle}`, 'json');
  const ls = data.livestream;
  return {
    name: data.user?.username ?? handle,
    live: Boolean(ls?.is_live ?? ls),
    title: ls?.session_title ?? '',
    game: ls?.categories?.[0]?.name ?? '',
    thumb: ls?.thumbnail?.url ?? ls?.thumbnail?.src ?? null,
    avatar: data.user?.profile_pic ?? null,
  };
}

async function resolveKick(link) {
  const s = await kickStatus(link.handle);
  return { platform: 'kick', handle: link.handle, name: s.name, url: `https://kick.com/${link.handle}`, live: s.live };
}

// ---------- Melding plaatsen ----------
async function announce(client, s, data) {
  const channel = await client.channels.fetch(cfg.contentChannelId).catch(() => null);
  if (!channel) return console.warn('[content] Contentkanaal niet gevonden');
  const p = PLATFORM[s.platform];
  // Altijd de meldingsrol 📡 Content taggen (uit het rollenpaneel)
  const roleId = require('./selfRoles').roleId('content');
  const ping = roleId ? `<@&${roleId}> ` : '';
  const allowedMentions = { roles: roleId ? [roleId] : [] };

  if (s.platform === 'youtube') {
    const link = `https://www.youtube.com/watch?v=${data.id}`;
    await channel.send({
      content: `${ping}📺 **${s.name}** heeft een nieuwe video geplaatst!\n${link}`,
      allowedMentions,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(p.color)
    .setAuthor({ name: `${s.name} is live op ${p.label}!`, url: s.url, iconURL: data.avatar ?? undefined })
    .setTitle(data.title || `${s.name} is live!`)
    .setURL(s.url)
    .setTimestamp();
  if (data.game) embed.addFields({ name: '🎮 Game', value: data.game, inline: true });
  const thumb = s.platform === 'twitch'
    ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${s.handle}-1280x720.jpg?t=${Date.now()}`
    : data.thumb;
  if (thumb) embed.setImage(thumb);
  await channel.send({
    content: `${ping}🔴 **${s.name}** is nu live op ${p.label}! Kom kijken!`,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Kijk mee').setEmoji('📺').setStyle(ButtonStyle.Link).setURL(s.url),
    )],
    allowedMentions,
  });
}

// ---------- Controleren ----------
async function checkOne(client, s) {
  if (s.platform === 'youtube') {
    const feed = await youtubeFeed(s.channelId);
    if (feed.name) s.name = feed.name;
    // Nieuwe video's: nog niet gezien en niet ouder dan 2 dagen (oudste eerst)
    const fresh = feed.entries.filter((e) => !s.seen.includes(e.id) && Date.now() - e.published < 2 * 86400e3).reverse();
    for (const e of fresh) await announce(client, s, e);
    s.seen = [...new Set([...feed.entries.map((e) => e.id), ...s.seen])].slice(0, 50);
    return;
  }
  const st = s.platform === 'twitch' ? await twitchStatus(s.handle) : await kickStatus(s.handle);
  if (st.live && !s.live) await announce(client, s, st);
  s.live = st.live;
}

let checking = false;
async function checkAll(client) {
  if (checking) return;
  checking = true;
  try {
    const l = list();
    for (const s of l) {
      try { await checkOne(client, s); } catch (e) { console.warn(`[content] ${s.name}: ${e.message}`); }
    }
    // Opslaan zonder tussendoor toegevoegde/verwijderde streamers te overschrijven
    const fresh = list();
    store(fresh.map((x) => l.find((y) => y.id === x.id) ?? x));
  } finally {
    checking = false;
  }
}

// ---------- /content (formulier) en /content-lijst ----------
const command = new SlashCommandBuilder()
  .setName('content')
  .setDescription('Een YouTuber of streamer toevoegen (je krijgt een formulier)')
  .setDMPermission(false)
  .toJSON();
const listCommand = new SlashCommandBuilder()
  .setName('content-lijst')
  .setDescription('Alle YouTubers en streamers bekijken en verwijderen')
  .setDMPermission(false)
  .toJSON();

const line = (s) => `${PLATFORM[s.platform].emoji} **${s.name}** • [${PLATFORM[s.platform].label}](${s.url})`;

function contentForm() {
  return new ModalBuilder()
    .setCustomId('content_form')
    .setTitle('📡 Content toevoegen')
    .addLabelComponents(
      new LabelBuilder().setLabel('Link naar het kanaal').setDescription('YouTube, Twitch of Kick • de rol 📡 Content wordt automatisch getagd')
        .setTextInputComponent(new TextInputBuilder().setCustomId('link').setStyle(TextInputStyle.Short)
          .setPlaceholder('Bijv. youtube.com/@naam of twitch.tv/naam').setMaxLength(200).setRequired(true)),
    );
}

function overview() {
  const l = list();
  if (!l.length) return { content: '📭 Er zijn nog geen YouTubers of streamers. Voeg er een toe met `/content`.', embeds: [], components: [] };
  return {
    content: '',
    embeds: [new EmbedBuilder().setColor(cfg.color).setTitle(`📡  Contentmeldingen (${l.length})`)
      .setDescription(l.map(line).join('\n').slice(0, 4000))
      .setFooter({ text: 'Elke 3 minuten gecontroleerd • Kies hieronder iemand om te verwijderen' })],
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('content_remove').setPlaceholder('🗑️ Iemand verwijderen...')
      .addOptions(l.slice(0, 25).map((s) => ({ label: s.name.slice(0, 100), description: PLATFORM[s.platform].label, value: s.id, emoji: PLATFORM[s.platform].emoji }))))],
    allowedMentions: { parse: [] },
  };
}

async function onSubmit(interaction) {
  if (!isAdmin(interaction.user)) return interaction.reply({ content: '❌ Geen toestemming.', flags: MessageFlags.Ephemeral });
  const link = parseLink(interaction.fields.getTextInputValue('link').trim());
  if (!link) return interaction.reply({ content: '❌ Dat is geen YouTube-, Twitch- of Kick-link.', flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let s;
  try {
    s = link.platform === 'youtube' ? await resolveYoutube(link) : link.platform === 'twitch' ? await resolveTwitch(link) : await resolveKick(link);
  } catch (e) {
    return interaction.editReply(`❌ Kon het kanaal niet toevoegen: ${e.message}`);
  }
  const l = list();
  if (l.some((x) => x.platform === s.platform && (x.channelId ?? x.handle) === (s.channelId ?? s.handle))) {
    return interaction.editReply(`ℹ️ **${s.name}** staat er al in.`);
  }
  s.id = newId();
  l.push(s);
  store(l);
  console.log(`[content] ${interaction.user.tag} voegde ${s.name} (${s.platform}) toe`);
  return interaction.editReply({
    content: `✅ ${line(s)} is toegevoegd!\n${s.platform === 'youtube' ? 'Bij een nieuwe video' : 'Zodra de stream live gaat'} komt er een melding in <#${cfg.contentChannelId}>.`,
    allowedMentions: { parse: [] },
  });
}

async function onRemove(interaction) {
  if (!isAdmin(interaction.user)) return interaction.reply({ content: '❌ Geen toestemming.', flags: MessageFlags.Ephemeral });
  const l = list();
  const s = l.find((x) => x.id === interaction.values[0]);
  store(l.filter((x) => x.id !== interaction.values[0]));
  const o = overview();
  return interaction.update({ ...o, content: `${s ? `🗑️ **${s.name}** is verwijderd.` : 'Al verwijderd.'}\n${o.content}`.trim() });
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => {
    setTimeout(() => checkAll(client), 15000);
    setInterval(() => checkAll(client), CHECK_EVERY).unref();
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && ['content', 'content-lijst'].includes(interaction.commandName)) {
        if (!isAdmin(interaction.user)) {
          return interaction.reply({ content: '❌ Alleen de beheerders van de bot kunnen dit.', flags: MessageFlags.Ephemeral });
        }
        if (interaction.commandName === 'content') return interaction.showModal(contentForm());
        return interaction.reply({ ...overview(), flags: MessageFlags.Ephemeral });
      }
      if (interaction.isModalSubmit() && interaction.customId === 'content_form') return onSubmit(interaction);
      if (interaction.isStringSelectMenu() && interaction.customId === 'content_remove') return onRemove(interaction);
    } catch (e) {
      console.error('[content]', e);
      const m = { content: '❌ Er ging iets mis.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.editReply(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.command = command;
module.exports.listCommand = listCommand;
module.exports._test = { parseLink, youtubeFeed };
