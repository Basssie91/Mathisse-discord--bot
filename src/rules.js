// Regels-embed in het regelskanaal.
// Bij elke start wordt gecontroleerd of hij er nog staat (anders opnieuw geplaatst),
// en wordt hij verwijderd terwijl de bot online is, dan komt hij meteen terug.
const path = require('node:path');
const { Events, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const TITLE = '📜  SERVERREGELS';
const BANNER_FILE = 'banner.png';
const BANNER_PATH = path.join(__dirname, '..', 'assets', BANNER_FILE);

const RULES = [
  ['1. Respect voor iedereen', 'Behandel iedereen met respect. Geen schelden, pesten, discriminatie, racisme of bedreigingen.'],
  ['2. Geen spam', 'Geen spam, flooden, onnodige tags of steeds hetzelfde bericht sturen. Ook geen overmatig gebruik van hoofdletters of emoji\'s.'],
  ['3. Geen reclame', 'Geen reclame voor andere servers, socials of producten, ook niet via DM. Partner worden? Doe een **Partner aanvraag** via het ticketmenu.'],
  ['4. Geen ongepaste inhoud', 'Geen NSFW, grove, gewelddadige of schokkende inhoud. Dit geldt ook voor namen, profielfoto\'s en statussen.'],
  ['5. Privacy', 'Deel geen persoonlijke gegevens van jezelf of anderen, zoals adressen, telefoonnummers of foto\'s zonder toestemming.'],
  ['6. Gebruik de juiste kanalen', 'Houd gesprekken in het kanaal waar ze bij horen.'],
  ['7. Geen drama', 'Ruzie of problemen los je privé op of via een ticket, niet in de openbare kanalen.'],
  ['8. Luister naar het team', 'Volg de aanwijzingen van staff en bestuur op. Ben je het ergens niet mee eens? Maak een ticket aan.'],
  ['9. Geen scams of oplichting', 'Geen nep-links, phishing, "gratis Nitro" of andere oplichting. Dit leidt tot een directe ban.'],
  ['10. Discord-regels', 'Houd je aan de [Discord Community Guidelines](https://discord.com/guidelines) en de [Servicevoorwaarden](https://discord.com/terms).'],
];

function buildPayload(guild) {
  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(TITLE)
    .setDescription('Welkom! Om de server leuk en veilig te houden gelden de regels hieronder. Door in de server te blijven ga je akkoord met deze regels.')
    .addFields(...RULES.map(([name, value]) => ({ name, value })), {
      name: '⚠️ Straffen',
      value: 'Overtreding van de regels kan leiden tot een waarschuwing, mute, kick of ban. Het team beslist per situatie.'
        + (cfg.panelChannelId ? `\n❓ Vragen over de regels? Maak een ticket in <#${cfg.panelChannelId}>.` : ''),
    })
    .setImage(`attachment://${BANNER_FILE}`)
    .setFooter({ text: `${guild.name} • Regels`, iconURL: guild.iconURL({ size: 64 }) ?? undefined });
  return { embeds: [embed], files: [new AttachmentBuilder(BANNER_PATH, { name: BANNER_FILE })] };
}

async function checkRules(client) {
  if (!cfg.rulesChannelId) return;
  try {
    const channel = await client.channels.fetch(cfg.rulesChannelId);
    const saved = store.load('rules.json', {});
    let msg = saved.messageId && saved.channelId === channel.id
      ? await channel.messages.fetch(saved.messageId).catch(() => null) : null;
    if (!msg) {
      const recent = await channel.messages.fetch({ limit: 50 });
      msg = recent.find((m) => m.author.id === client.user.id && m.embeds[0]?.title === TITLE) ?? null;
    }
    const payload = buildPayload(channel.guild);
    if (msg) {
      await msg.edit({ ...payload, attachments: [] });
      console.log('[regels] Regels bijgewerkt');
    } else {
      msg = await channel.send(payload);
      console.log('[regels] Regels (opnieuw) geplaatst');
    }
    store.save('rules.json', { channelId: channel.id, messageId: msg.id });
  } catch (e) {
    console.warn('[regels] Kon regels niet controleren:', e.message);
  }
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => checkRules(client));
  client.on(Events.MessageDelete, (message) => {
    if (message.id === store.load('rules.json', {}).messageId) {
      console.log('[regels] Regels zijn verwijderd, ik plaats ze opnieuw');
      setTimeout(() => checkRules(client), 2000);
    }
  });
};
