// Botstatus: één bericht in het statuskanaal dat de bot zelf bijwerkt.
// 🟢 Online  •  🔄 Herstarten  •  🔴 Offline  •  ⚠️ Onverwacht offline geweest (bv. crash of server uit)
// Elke minuut wordt "laatst gecontroleerd" bijgewerkt. Stond de bot uit zonder netjes af te sluiten,
// dan ziet hij dat bij de volgende start en zet hij de storing in de geschiedenis.
// De geschiedenis begint bij elke (her)start opnieuw (max. 8 regels).
const { Events, EmbedBuilder } = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const FILE = 'status.json';
const HEARTBEAT = 60 * 1000;
const STATES = {
  online: { color: '#57F287', label: '🟢  ONLINE', text: 'De bot is online en werkt.' },
  restarting: { color: '#FEE75C', label: '🔄  HERSTARTEN', text: 'De bot wordt herstart en is zo weer terug.' },
  offline: { color: '#ED4245', label: '🔴  OFFLINE', text: 'De bot is offline.' },
};

let client = null;
let state = store.load(FILE, {});
state.history ??= [];
const t = (ms, f = 'f') => `<t:${Math.floor(ms / 1000)}:${f}>`;
const persist = () => store.save(FILE, state);

function addHistory(text) {
  state.history.unshift({ at: Date.now(), text });
  state.history = state.history.slice(0, 8);
}

function buildEmbed() {
  const s = STATES[state.status] ?? STATES.offline;
  const lines = [s.text, ''];
  if (state.status === 'online') {
    lines.push(`⏱️ Online sinds ${t(state.since)} (${t(state.since, 'R')})`);
    lines.push(`📶 Ping: **${client?.ws?.ping >= 0 ? `${client.ws.ping} ms` : '...'}**`);
    lines.push(`🔁 Laatst gecontroleerd ${t(state.lastSeen, 'R')}`);
  } else {
    lines.push(`🕒 Sinds ${t(state.since)} (${t(state.since, 'R')})`);
  }
  if (state.history.length) {
    lines.push('', '**📜 Geschiedenis**', ...state.history.map((h) => `${t(h.at, 'f')} • ${h.text}`));
  }
  return new EmbedBuilder()
    .setColor(s.color)
    .setAuthor({ name: 'BOTSTATUS', iconURL: client?.user?.displayAvatarURL({ size: 64 }) })
    .setTitle(s.label)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Wordt automatisch bijgewerkt' })
    .setTimestamp();
}

// Statusbericht bijwerken (of opnieuw plaatsen als het weg is)
async function render() {
  if (!client?.isReady() || !cfg.statusChannelId) return;
  try {
    const channel = await client.channels.fetch(cfg.statusChannelId);
    let msg = state.messageId ? await channel.messages.fetch(state.messageId).catch(() => null) : null;
    if (msg) await msg.edit({ embeds: [buildEmbed()] });
    else {
      msg = await channel.send({ embeds: [buildEmbed()] });
      state.messageId = msg.id;
      persist();
    }
  } catch (e) {
    console.warn('[status] Kon status niet bijwerken:', e.message);
  }
}

async function set(status, historyText) {
  state.status = status;
  state.since = Date.now();
  state.clean = status !== 'online'; // netjes afgesloten of herstart aangekondigd
  if (historyText) addHistory(historyText);
  persist();
  await render();
}

// Netjes afsluiten (bv. server gestopt in Bot-Hosting): eerst 🔴 Offline zetten
let shuttingDown = false;
async function shutdown(reason, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (state.status !== 'restarting') {
    await Promise.race([set('offline', reason), new Promise((r) => setTimeout(r, 4000))]);
  }
  process.exit(code);
}

module.exports = (c) => {
  client = c;

  client.once(Events.ClientReady, async () => {
    const now = Date.now();
    // Geschiedenis loopt alleen tot de volgende (her)start: bij elke start opnieuw beginnen
    const restartedBy = state.status === 'restarting' ? state.history[0]?.text : null;
    state.history = restartedBy ? [{ at: state.since, text: restartedBy }] : [];
    if (state.status === 'restarting') {
      addHistory(`✅ Herstart klaar (duurde ${Math.max(1, Math.round((now - state.since) / 1000))} sec)`);
    } else if (state.lastSeen && !state.clean) {
      // Vorige keer niet netjes afgesloten: storing
      addHistory(`⚠️ Onverwacht offline vanaf ${t(state.lastSeen, 't')}`);
    } else if (state.status === 'offline') {
      addHistory('🟢 Weer online');
    }
    state.lastSeen = now;
    await set('online', null);

    setInterval(() => {
      state.lastSeen = Date.now();
      persist();
      render();
    }, HEARTBEAT).unref();
  });

  // Statusbericht verwijderd? Meteen terugzetten
  client.on(Events.MessageDelete, (message) => {
    if (message.id === state.messageId) {
      state.messageId = null;
      setTimeout(render, 2000);
    }
  });

  process.on('SIGTERM', () => shutdown('🔴 Bot gestopt'));
  process.on('SIGINT', () => shutdown('🔴 Bot gestopt'));
  process.on('uncaughtException', (e) => {
    console.error('[status] Crash:', e);
    shutdown(`💥 Bot gecrasht: ${String(e.message).slice(0, 80)}`, 1);
  });
};

// Voor /restart: 🔄 Herstarten tonen voordat de bot stopt
module.exports.restarting = (user) => set('restarting', `🔄 Herstart door ${user ? `<@${user.id}>` : 'het systeem'}`);
module.exports.failed = (why) => set('online', `❌ Herstart mislukt: ${String(why).slice(0, 80)}`);
