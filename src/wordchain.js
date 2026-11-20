// Woordketting: elk woord begint met de laatste letter van het vorige woord.
// Woorden worden gecontroleerd tegen een Nederlandse woordenlijst (OpenTaal).
// Berichten die binnenkwamen terwijl de bot offline was, worden na het opstarten alsnog verwerkt.
const { Events, EmbedBuilder } = require('discord.js');
const cfg = require('./config');
const { load, save } = require('./store');
const wordlist = require('./wordlist');

const FILE = 'wordchain.json';
const MIN_LENGTH = 2;
let chain = load(FILE, { lastWord: null, lastUserId: null, used: [], count: 0, record: 0, introPosted: false });
chain.history ??= []; // laatste geldige woorden: { msgId, word, userId }

let catchingUp = false; // tijdens het inhalen geen losse meldingen sturen
const normalize = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Kort bericht dat zichzelf na een paar seconden weer opruimt
async function notice(channel, text, seconds = 6) {
  if (catchingUp) return;
  const m = await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
  if (m) setTimeout(() => m.delete().catch(() => {}), seconds * 1000);
}

async function onWord(message) {
  const raw = message.content.trim();
  const word = normalize(raw);
  const reject = async (why) => {
    await message.delete().catch(() => {});
    return notice(message.channel, `🔤 ${message.author}, ${why}`);
  };

  if (!/^[a-z]+$/.test(word)) return reject('stuur precies **één woord**, alleen letters.');
  if (word.length < MIN_LENGTH) return reject(`een woord moet minstens **${MIN_LENGTH} letters** hebben.`);
  if (message.author.id === chain.lastUserId) return reject('je mag niet **twee keer achter elkaar**. Wacht op iemand anders!');
  if (chain.lastWord) {
    const need = chain.lastWord.slice(-1);
    if (word[0] !== need) return reject(`het woord moet beginnen met een **${need.toUpperCase()}** (laatste letter van *${chain.lastWord}*).`);
  }
  if (chain.used.includes(word)) return reject(`**${word}** is al gebruikt in deze ketting!`);
  if (wordlist.exists(word) === false) return reject(`**${raw}** is geen Nederlands woord.`);

  chain.lastWord = word;
  chain.lastUserId = message.author.id;
  chain.used.push(word);
  if (chain.used.length > 2000) chain.used = chain.used.slice(-2000);
  chain.count += 1;
  if (chain.count > chain.record) chain.record = chain.count;
  chain.history.push({ msgId: message.id, word, userId: message.author.id });
  if (chain.history.length > 300) chain.history = chain.history.slice(-300);
  save(FILE, chain);
  await message.react(chain.count % 50 === 0 ? '🎉' : '✅').catch(() => {});
}

// Iemand verwijdert zelf een woord uit de ketting -> het vorige woord telt weer
async function onWordDeleted(message) {
  const i = chain.history.findIndex((h) => h.msgId === message.id);
  if (i === -1) return; // geen geldig woord (bijv. door de bot verwijderd)
  const [removed] = chain.history.splice(i, 1);
  const u = chain.used.lastIndexOf(removed.word);
  if (u !== -1) chain.used.splice(u, 1);
  chain.count = Math.max(0, chain.count - 1);

  const wasLast = i === chain.history.length;
  if (wasLast) {
    const prev = chain.history[chain.history.length - 1];
    chain.lastWord = prev?.word ?? null;
    chain.lastUserId = prev?.userId ?? null;
  }
  save(FILE, chain);

  if (wasLast) {
    await notice(message.channel, chain.lastWord
      ? `↩️ Het woord **${removed.word}** is verwijderd. Het laatste woord is weer **${chain.lastWord}**, dus het volgende woord begint met een **${chain.lastWord.slice(-1).toUpperCase()}**.`
      : `↩️ Het woord **${removed.word}** is verwijderd. Begin maar met een nieuw woord!`, 10);
  }
}

// Uitleg (één keer)
async function postIntro(client) {
  if (chain.introPosted) return;
  try {
    const ch = await client.channels.fetch(cfg.wordChainChannelId);
    await ch.send({ embeds: [new EmbedBuilder().setColor(cfg.color).setTitle('🔤  WOORDKETTING').setDescription([
      'Maak samen een zo lang mogelijke ketting!',
      '',
      '• Elk woord begint met de **laatste letter** van het vorige woord',
      '• Stuur **één woord** per bericht',
      '• Alleen **Nederlandse woorden**',
      '• Een woord mag maar **één keer** gebruikt worden',
      '• Je mag **niet twee keer achter elkaar**',
      '',
      'Begin maar met een woord! 👇',
    ].join('\n'))] });
    chain.introPosted = true;
    save(FILE, chain);
  } catch (e) {
    console.warn('[woordketting] Kon uitleg niet plaatsen:', e.message);
  }
}

// ---------- Inhalen na een herstart ----------
// Berichten die binnenkwamen terwijl de bot offline was alsnog verwerken, in de juiste volgorde.
const caughtUp = new Set(); // berichten die al bij het inhalen verwerkt zijn
async function catchUp(client) {
  const channel = await client.channels.fetch(cfg.wordChainChannelId).catch(() => null);
  if (!channel) return;
  const msgs = [...(await channel.messages.fetch({ limit: 100 })).values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  // Houvast: het laatste woord dat de bot al goedgekeurd heeft (of de uitleg van de bot)
  let last = -1;
  msgs.forEach((m, i) => {
    if (m.reactions.cache.some((r) => r.me) || (m.author.id === client.user.id && m.embeds.length)) last = i;
  });
  if (last === -1 && chain.history.length) return; // geen houvast terwijl er al een ketting is: niets doen
  let done = 0;
  for (const m of msgs.slice(last + 1)) {
    if (m.author.bot || m.system) continue;
    caughtUp.add(m.id);
    await onWord(m).catch((e) => console.warn('[woordketting] Inhalen:', e.message));
    done++;
  }
  if (done) console.log(`[woordketting] ${done} gemist(e) bericht(en) alsnog verwerkt`);
}

module.exports = (client) => {
  let open;
  const readyGate = new Promise((r) => { open = r; }); // live berichten wachten tot het inhalen klaar is

  client.once(Events.ClientReady, async () => {
    await wordlist.load(); // eerst de woordenlijst, ook voor het inhalen
    await postIntro(client);
    catchingUp = true;
    try {
      await catchUp(client);
    } catch (e) {
      console.warn('[woordketting] Inhalen mislukt:', e.message);
    } finally {
      catchingUp = false;
      open();
    }
    console.log('[woordketting] Woordketting staat aan');
  });

  client.on(Events.MessageDelete, async (message) => {
    if (message.channelId !== cfg.wordChainChannelId) return;
    try { await onWordDeleted(message); } catch (e) { console.warn('[woordketting]', e.message); }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot || message.system) return;
    if (message.channelId !== cfg.wordChainChannelId) return;
    await readyGate;
    if (caughtUp.has(message.id)) return; // al verwerkt bij het inhalen
    try { await onWord(message); } catch (e) { console.warn('[woordketting]', e.message); }
  });
};
