// Promotie van andere Discord-servers: elke server een eigen embed met een Join-knop.
// Naam, icoon, banner en ledenaantal worden live opgehaald via de uitnodiging.
// Bij elke start (en elke 6 uur) bijgewerkt, en teruggezet als een bericht verwijderd wordt.
const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const FILE = 'promo.json';
const PROMOS = [
  { key: 'wts', invite: 'wts', label: 'Test server', emoji: '🧪', text: 'De testserver: hier worden nieuwe dingen eerst uitgeprobeerd. Wil je als eerste zien wat er aankomt? Join!' },
  { key: 'frp', invite: 'frp', label: 'Roleplay server', emoji: '🎭', text: 'De roleplay server: duik in de stad, bouw je eigen verhaal en speel samen met de community. Join!' },
];

const saved = () => store.load(FILE, {});

async function build(client, p) {
  const url = `https://discord.gg/${p.invite}`;
  const inv = await client.fetchInvite(p.invite, { withCounts: true }).catch(() => null);
  const g = inv?.guild;
  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: `${p.emoji}  ${p.label}`.toUpperCase() })
    .setTitle(g?.name ?? p.label)
    .setURL(url)
    .setDescription(p.text);
  if (inv?.memberCount != null) {
    embed.addFields(
      { name: '👥 Leden', value: `${inv.memberCount}`, inline: true },
      { name: '🟢 Online', value: `${inv.presenceCount ?? '?'}`, inline: true },
    );
  }
  const icon = g?.iconURL?.({ size: 256 });
  if (icon) embed.setThumbnail(icon);
  const banner = g?.bannerURL?.({ size: 1024 }) ?? g?.splashURL?.({ size: 1024 });
  if (banner) embed.setImage(banner);
  if (!inv) console.warn(`[promo] Uitnodiging ${url} werkt niet (verlopen of ongeldig)`);
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Join server').setEmoji('🚀').setStyle(ButtonStyle.Link).setURL(url),
    )],
  };
}

let busy = false;
async function check(client) {
  if (!cfg.promoChannelId || busy) return;
  busy = true;
  try {
    const channel = await client.channels.fetch(cfg.promoChannelId);
    const ids = saved();
    for (const p of PROMOS) {
      const payload = await build(client, p);
      let msg = ids[p.key] ? await channel.messages.fetch(ids[p.key]).catch(() => null) : null;
      if (msg) await msg.edit(payload);
      else msg = await channel.send(payload);
      ids[p.key] = msg.id;
    }
    store.save(FILE, ids);
    console.log('[promo] Promoties bijgewerkt');
  } catch (e) {
    console.warn('[promo] Kon promoties niet bijwerken:', e.message);
  } finally {
    busy = false;
  }
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => {
    check(client);
    setInterval(() => check(client), 6 * 60 * 60 * 1000).unref(); // ledenaantallen bijwerken
  });
  client.on(Events.MessageDelete, (message) => {
    if (Object.values(saved()).includes(message.id)) setTimeout(() => check(client), 2000);
  });
};
