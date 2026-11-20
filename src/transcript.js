// Maakt een HTML-transcript van een ticketkanaal
const fs = require('node:fs');
const path = require('node:path');

// Banner in het bestand zelf, zodat hij later ook zonder internet werkt
let BANNER_DATA = '';
try { BANNER_DATA = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', 'assets', 'banner.png')).toString('base64')}`; } catch { /* geen banner */ }

const TZ = 'Europe/Amsterdam';
const fmt = (t) => new Date(t).toLocaleString('nl-NL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const duration = (ms) => {
  const m = Math.max(1, Math.round(ms / 60000)); const h = Math.floor(m / 60); const d = Math.floor(h / 24);
  return d ? `${d} dag${d === 1 ? '' : 'en'} ${h % 24} uur` : h ? `${h} uur ${m % 60} min` : `${m} min`;
};

async function fetchAll(channel, max = 2000) {
  const all = [];
  let before;
  while (all.length < max) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse();
}

// <@123> -> @naam, <@&123> -> @rol, <#123> -> #kanaal
function mentions(text, m, guild) {
  return String(text ?? '')
    .replace(/<@!?(\d+)>/g, (_, id) => `@${m.mentions?.users?.get(id)?.username ?? guild.members.cache.get(id)?.displayName ?? 'gebruiker'}`)
    .replace(/<@&(\d+)>/g, (_, id) => `@${guild.roles.cache.get(id)?.name ?? 'rol'}`)
    .replace(/<#(\d+)>/g, (_, id) => `#${guild.channels.cache.get(id)?.name ?? 'kanaal'}`)
    .replace(/<t:(\d+)(:\w)?>/g, (_, t) => fmt(Number(t) * 1000));
}

function rowsHtml(guild, messages) {
  return messages.map((m) => {
    const parts = [];
    if (m.content) parts.push(`<div class="text">${esc(mentions(m.content, m, guild)).replace(/\n/g, '<br>')}</div>`);
    for (const e of m.embeds) {
      parts.push(`<div class="embed">${e.title ? `<b>${esc(e.title)}</b><br>` : ''}${esc(mentions(e.description, m, guild)).replace(/\n/g, '<br>')}${
        (e.fields ?? []).map((f) => `<div class="field"><b>${esc(f.name)}</b><br>${esc(mentions(f.value, m, guild)).replace(/\n/g, '<br>')}</div>`).join('')}</div>`);
    }
    for (const a of m.attachments.values()) parts.push(`<div class="att">📎 <a href="${esc(a.url)}">${esc(a.name)}</a></div>`);
    if (!parts.length) return '';
    return `<div class="msg"><img class="av" src="${esc(m.author.displayAvatarURL({ size: 64 }))}">
<div><div class="head"><span class="name${m.author.bot ? ' bot' : ''}">${esc(m.member?.displayName ?? m.author.username)}</span>${m.author.bot ? '<span class="tag">BOT</span>' : ''}<span class="time">${fmt(m.createdTimestamp)}</span></div>${parts.join('')}</div></div>`;
  }).join('\n');
}

async function buildTranscript(channel, meta) {
  const messages = await fetchAll(channel);
  const { guild } = channel;
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript ${esc(channel.name)}</title><style>
body{margin:0;background:#0b0f19;color:#dbdee1;font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px}
header{background:#05070d;padding:0 0 18px;border-bottom:2px solid #1d5be0}
header .banner{display:block;width:100%;max-width:1000px;height:auto}
header .info{padding:16px 24px 0;max-width:952px}
header h1{margin:0 0 12px;font-size:22px;color:#f0c14b}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 18px}
.grid div{background:#121a2b;border-radius:6px;padding:8px 12px;font-size:13px;color:#9aa3b5}
.grid b{display:block;color:#fff;font-size:14px;margin-top:2px}
main{padding:12px 24px 40px;max-width:1000px}
.msg{display:flex;gap:14px;padding:8px 0}.av{width:40px;height:40px;border-radius:50%;flex:none}
.head{margin-bottom:2px}.name{color:#fff;font-weight:600}.name.bot{color:#f0c14b}
.tag{background:#1d5be0;color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;margin-left:6px;vertical-align:middle}
.time{color:#7c8597;font-size:12px;margin-left:8px}.text{word-wrap:break-word}
.embed{border-left:4px solid #f0c14b;background:#121a2b;padding:8px 12px;border-radius:4px;margin-top:4px;max-width:520px}
.field{margin-top:6px}.att a{color:#4c8dff}
</style></head><body><header>${BANNER_DATA ? `<img class="banner" src="${BANNER_DATA}" alt="${esc(guild.name)}">` : ''}
<div class="info"><h1>🎫 ${esc(channel.name)}</h1><div class="grid">
<div>🏷️ Soort<b>${esc(meta.type)}</b></div>
<div>👤 Geopend door<b>${esc(meta.opener)}</b></div>
<div>🔒 Gesloten door<b>${esc(meta.closer)}</b></div>
${meta.subject ? `<div>📝 Onderwerp<b>${esc(meta.subject)}</b></div>` : ''}
<div>🕒 Open<b>${fmt(channel.createdTimestamp)} – ${fmt(Date.now())} (${duration(Date.now() - channel.createdTimestamp)})</b></div>
<div>📝 Reden van sluiten<b>${esc(meta.reason)}</b></div>
<div>💬 Berichten<b>${messages.length}</b></div>
</div></div></header><main>
${rowsHtml(guild, messages)}
</main></body></html>`;
  return { html, count: messages.length };
}

module.exports = { buildTranscript };
