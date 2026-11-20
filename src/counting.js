// Tellen: samen zo hoog mogelijk tellen, steeds het volgende getal.
// Niet twee keer achter elkaar; fout = opnieuw beginnen bij 1.
// Berichten die binnenkwamen terwijl de bot offline was, worden na het opstarten alsnog verwerkt.
const { Events, EmbedBuilder } = require('discord.js');
const cfg = require('./config');
const { load, save } = require('./store');

const FILE = 'counting.json';
// Met de vorige bot waren ze bij 134 gebleven: we gaan verder bij 135
const START = cfg.countingStartAt ?? 0;
// runStartRecord 0: het echte record van de vorige bot is onbekend, dus geen 🏆 in deze eerste ronde
let counting = load(FILE, { current: START, lastUserId: null, record: START, runStartRecord: 0, introPosted: false, started: false });
counting.runStartRecord ??= counting.record; // record aan het begin van deze ronde

let catchingUp = false;

async function notice(channel, text, seconds = 6) {
  if (catchingUp) return;
  const m = await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
  if (m) setTimeout(() => m.delete().catch(() => {}), seconds * 1000);
}

async function onCount(message) {
  const text = message.content.trim();
  if (!/^\d+$/.test(text)) {
    await message.delete().catch(() => {});
    return notice(message.channel, `🔢 ${message.author}, in dit kanaal mag je alleen tellen!`);
  }
  const n = Number(text);
  const expected = counting.current + 1;
  counting.started = true;

  if (message.author.id === counting.lastUserId) {
    await message.react('❌').catch(() => {});
    const was = counting.current;
    counting = { ...counting, current: 0, lastUserId: null, runStartRecord: counting.record };
    save(FILE, counting);
    return message.reply({ content: `❌ ${message.author} telde **twee keer achter elkaar**! We waren bij **${was}**. Begin opnieuw bij **1**.`, allowedMentions: { parse: [] } });
  }

  if (n !== expected) {
    await message.react('❌').catch(() => {});
    const was = counting.current;
    counting = { ...counting, current: 0, lastUserId: null, runStartRecord: counting.record };
    save(FILE, counting);
    return message.reply({ content: `❌ ${message.author} verpestte het! Het volgende getal was **${expected}**. We waren bij **${was}**. Begin opnieuw bij **1**.\n🏆 Record: **${counting.record}**`, allowedMentions: { parse: [] } });
  }

  counting.current = n;
  counting.lastUserId = message.author.id;
  // 🏆 alleen op het getal dat het vorige record verbreekt
  const breaksRecord = counting.runStartRecord > 0 && n === counting.runStartRecord + 1;
  if (n > counting.record) counting.record = n;
  save(FILE, counting);
  await message.react(breaksRecord ? '🏆' : '✅').catch(() => {});
  if (breaksRecord) await notice(message.channel, '🏆 **Nieuw record!** Jullie zijn verder dan ooit. Ga zo door!', 8);
}

// Uitleg (één keer)
async function postIntro(client) {
  if (counting.introPosted) return;
  try {
    const ch = await client.channels.fetch(cfg.countingChannelId);
    await ch.send({ embeds: [new EmbedBuilder().setColor(cfg.color).setTitle('🔢  TELLEN').setDescription([
      'Tel samen zo hoog mogelijk!',
      '',
      '• Stuur alleen het **volgende getal**',
      '• Je mag **niet twee keer achter elkaar**',
      '• Fout? Dan begint het weer bij **1**',
      '',
      counting.current ? `We gaan verder waar jullie gebleven waren: het volgende getal is **${counting.current + 1}**! 👇` : 'Begin maar met **1**! 👇',
    ].join('\n'))] });
    counting.introPosted = true;
    save(FILE, counting);
  } catch (e) {
    console.warn('[tellen] Kon uitleg niet plaatsen:', e.message);
  }
}

// ---------- Inhalen na een herstart ----------
const caughtUp = new Set();
async function catchUp(client) {
  const channel = await client.channels.fetch(cfg.countingChannelId).catch(() => null);
  if (!channel) return;
  const msgs = [...(await channel.messages.fetch({ limit: 100 })).values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  // Houvast: laatste bericht waar deze bot al op reageerde
  let last = -1;
  msgs.forEach((m, i) => { if (m.reactions.cache.some((r) => r.me)) last = i; });
  // Eerste keer: verder vanaf het laatste "134" van de vorige bot
  if (last === -1 && !counting.started) {
    msgs.forEach((m, i) => { if (!m.author.bot && m.content.trim() === String(counting.current)) last = i; });
  }
  if (last === -1) return;
  let done = 0;
  for (const m of msgs.slice(last + 1)) {
    if (m.author.bot || m.system) continue;
    caughtUp.add(m.id);
    await onCount(m).catch((e) => console.warn('[tellen] Inhalen:', e.message));
    done++;
  }
  if (done) console.log(`[tellen] ${done} gemist(e) bericht(en) alsnog verwerkt`);
}

module.exports = (client) => {
  let open;
  const readyGate = new Promise((r) => { open = r; });

  client.once(Events.ClientReady, async () => {
    catchingUp = true;
    try {
      await catchUp(client);
    } catch (e) {
      console.warn('[tellen] Inhalen mislukt:', e.message);
    } finally {
      catchingUp = false;
      open();
    }
    await postIntro(client);
    console.log(`[tellen] Tellen staat aan (volgende getal: ${counting.current + 1})`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot || message.system) return;
    if (message.channelId !== cfg.countingChannelId) return;
    await readyGate;
    if (caughtUp.has(message.id)) return;
    try { await onCount(message); } catch (e) { console.warn('[tellen]', e.message); }
  });
};
