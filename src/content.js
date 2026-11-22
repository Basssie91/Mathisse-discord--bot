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

// Staat er op een YouTube-pagina een stream die NU live is? (meerdere kenmerken, YouTube wisselt vaak van opmaak)
function pageIsLive(html) {
  if (/"isLiveNow"\s*:\s*true|\\"isLiveNow\\"\s*:\s*true/.test(html)) return true;
  // Schema.org-gegevens: een uitzending die begonnen is maar nog geen einddatum heeft
  const broadcast = /itemprop="isLiveBroadcast"\s+content="True"/i.test(html);
  const ended = /itemprop="endDate"/i.test(html);
  if (broadcast && !ended) return true;
  return /"isLive"\s*:\s*true/.test(html) && !ended;
}
const videoIdOf = (html) => html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
const titleOf = (html) => decode(html.match(/<meta name="title" content="([^"]*)"/)?.[1]
  ?? html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/ - YouTube$/, ''));

// Is het kanaal nu live op YouTube?
// 1) De /live-pagina van het kanaal (verwijst naar de lopende stream als die er is)
// 2) Anders: de nieuwste video's uit de feed één voor één bekijken (een stream staat daar ook in)
async function youtubeLive(channelId, debug = []) {
  const html = await get(`https://www.youtube.com/channel/${channelId}/live`);
  if (/consent\.youtube\.com|confirm you.re not a bot|bevestig dat je geen bot bent/i.test(html)) {
    throw new Error('YouTube blokkeert de live-check (toestemmings- of botcontrolepagina)');
  }
  const liveId = videoIdOf(html);
  debug.push(liveId ? `/live → video ${liveId}` : '/live → kanaalpagina (geen stream)');
  if (liveId && pageIsLive(html)) return { id: liveId, title: titleOf(html) };

  const feed = await youtubeFeed(channelId).catch(() => ({ entries: [] }));
  const recent = feed.entries.filter((e) => Date.now() - e.published < 2 * 86400e3).slice(0, 3);
  for (const e of recent) {
    const page = await get(`https://www.youtube.com/watch?v=${e.id}`).catch(() => '');
    const live = pageIsLive(page);
    debug.push(`feed ${e.id}: ${live ? 'LIVE' : 'geen live'}`);
    if (live) return { id: e.id, title: e.title || titleOf(page) };
  }
  if (!recent.length) debug.push('feed: geen video\'s van de laatste 2 dagen');
  return null;
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
  // live: false, zodat een stream die nu al bezig is bij de eerstvolgende controle alsnog gemeld wordt
  return { platform: 'twitch', handle: link.handle, name: link.handle, url: `https://www.twitch.tv/${link.handle}`, live: false };
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
  return { platform: 'kick', handle: link.handle, name: s.name, url: `https://kick.com/${link.handle}`, live: false };
}

// ---------- Melding plaatsen ----------
async function announce(client, s, data) {
  console.log(`[content] Melding: ${s.name} (${s.platform}${data.live || s.platform !== 'youtube' ? ', live' : ', video'})`);
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
      content: data.live
        ? `${ping}🔴 **${s.name}** is nu live op YouTube! Kom kijken!\n${link}`
        : `${ping}📺 **${s.name}** heeft een nieuwe video geplaatst!\n${link}`,
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
    // Eerst: is er nu een livestream? (één melding per stream)
    const live = await youtubeLive(s.channelId).catch((e) => { console.warn(`[content] ${s.name} live-check: ${e.message}`); return null; });
    if (!checkedOnce.has(s.id)) { console.log(`[content] ${s.name} (YouTube): ${live ? `LIVE (${live.id})` : 'niet live'}`); checkedOnce.add(s.id); }
    if (live && s.liveId !== live.id) {
      await announce(client, s, { ...live, live: true });
      s.liveId = live.id;
      s.seen = [live.id, ...(s.seen ?? [])]; // niet nog eens als "nieuwe video" melden
    }
    const feed = await youtubeFeed(s.channelId);
    if (feed.name) s.name = feed.name;
    // Nieuwe video's: nog niet gezien en niet ouder dan 2 dagen (oudste eerst)
    const fresh = feed.entries.filter((e) => !s.seen.includes(e.id) && Date.now() - e.published < 2 * 86400e3).reverse();
    for (const e of fresh) {
      // Livestreams (ook geplande) staan ook in de feed; die meldt de live-check hierboven al
      const page = await get(`https://www.youtube.com/watch?v=${e.id}`).catch(() => '');
      if (/"isLiveContent":\s*true|"isUpcoming":\s*true/.test(page)) continue;
      await announce(client, s, e);
    }
    s.seen = [...new Set([...feed.entries.map((e) => e.id), ...s.seen])].slice(0, 50);
    return;
  }
  const st = s.platform === 'twitch' ? await twitchStatus(s.handle) : await kickStatus(s.handle);
  if (!checkedOnce.has(s.id)) { console.log(`[content] ${s.name} (${PLATFORM[s.platform].label}): ${st.live ? 'LIVE' : 'niet live'}`); checkedOnce.add(s.id); }
  if (st.live && !s.live) await announce(client, s, st);
  s.live = st.live;
}

let checking = false;
const checkedOnce = new Set(); // na een start één keer per kanaal de uitkomst loggen
async function checkAll(client) {
  if (checking) return;
  checking = true;
  try {
    const l = list();
    // Eenmalig: Twitch/Kick-streamers die toegevoegd werden terwijl ze live waren, stonden onterecht op "al gemeld"
    for (const s of l) if (s.platform !== 'youtube' && !s.fixedLive) { s.live = false; s.fixedLive = true; }
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
const checkCommand = new SlashCommandBuilder()
  .setName('content-check')
  .setDescription('Nu meteen controleren wie er live is (met uitleg als het misgaat)')
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

// /content-check: per kanaal laten zien wat de bot ziet (zonder console)
async function onCheck(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const l = list();
  if (!l.length) return interaction.editReply('📭 Er staat nog niemand in de lijst. Voeg iemand toe met `/content`.');
  const lines = [];
  for (const s of l) {
    const p = PLATFORM[s.platform];
    try {
      if (s.platform === 'youtube') {
        const debug = [];
        const live = await youtubeLive(s.channelId, debug);
        lines.push(`${p.emoji} **${s.name}**: ${live ? `🔴 LIVE • [${live.title || 'stream'}](https://www.youtube.com/watch?v=${live.id})` : '⚫ niet live'}`);
        lines.push(`-# ${debug.join(' • ')} • kanaal-id ${s.channelId}`);
      } else {
        const st = s.platform === 'twitch' ? await twitchStatus(s.handle) : await kickStatus(s.handle);
        lines.push(`${p.emoji} **${s.name}**: ${st.live ? `🔴 LIVE${st.title ? ` • ${st.title}` : ''}` : '⚫ niet live'}`);
      }
    } catch (e) {
      lines.push(`${p.emoji} **${s.name}**: ⚠️ ${e.message}`);
    }
  }
  const ch = await interaction.client.channels.fetch(cfg.contentChannelId).catch(() => null);
  const perms = ch?.permissionsFor(interaction.guild.members.me);
  const canPost = perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks']);
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(cfg.color).setTitle('📡  Content-check')
      .setDescription([
        ...lines,
        '',
        ch ? (canPost ? `✅ De bot kan berichten plaatsen in ${ch}.` : `❌ De bot mist rechten in ${ch} (bekijken, berichten sturen, links insluiten).`) : '❌ Het contentkanaal is niet gevonden.',
        '-# Iemand die nu 🔴 LIVE is maar nog geen melding kreeg, krijgt die bij de volgende controle (binnen 3 minuten).',
      ].join('\n').slice(0, 4000))],
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
    // Bij elke (her)start: iedereen die nu live is opnieuw melden
    const l = list();
    for (const x of l) { if (x.platform === 'youtube') x.liveId = null; else x.live = false; }
    store(l);
    setTimeout(() => checkAll(client), 15000);
    setInterval(() => checkAll(client), CHECK_EVERY).unref();
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && ['content', 'content-lijst', 'content-check'].includes(interaction.commandName)) {
        if (!isAdmin(interaction.user)) {
          return interaction.reply({ content: '❌ Alleen de beheerders van de bot kunnen dit.', flags: MessageFlags.Ephemeral });
        }
        if (interaction.commandName === 'content') return interaction.showModal(contentForm());
        if (interaction.commandName === 'content-check') return onCheck(interaction);
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
module.exports.checkCommand = checkCommand;
module.exports._test = { parseLink, youtubeFeed, youtubeLive, checkOne, pageIsLive };
