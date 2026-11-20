const fs = require('fs');
const path = require('path');
const https = require('https');

// Nederlandse woordenlijst (OpenTaal) voor de woordketting.
// Wordt één keer gedownload en daarna bewaard in data/wordlist-nl.txt.
const CACHE = path.join(__dirname, '..', 'data', 'wordlist-nl.txt');
const SOURCES = [
  'https://raw.githubusercontent.com/OpenTaal/opentaal-wordlist/master/wordlist.txt',
  'https://raw.githubusercontent.com/OpenTaal/opentaal-hunspell/master/nl.dic',
];
const normalize = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let words = null; // Set met woorden, of null als de lijst er (nog) niet is

function download(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 60000 }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(res.headers.location, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject).on('timeout', function onTimeout() { this.destroy(new Error('timeout')); });
  });
}

// Alleen losse woorden met letters (geen spaties, streepjes of cijfers)
function parse(text) {
  const set = new Set();
  for (let line of text.split(/\r?\n/)) {
    line = line.split('/')[0].trim(); // nl.dic heeft "woord/vlaggen"
    if (!line || /^\d+$/.test(line)) continue;
    const w = normalize(line);
    if (/^[a-z]+$/.test(w)) set.add(w);
  }
  return set;
}

async function load() {
  try {
    if (fs.existsSync(CACHE)) {
      words = new Set(fs.readFileSync(CACHE, 'utf8').split('\n').filter(Boolean));
      if (words.size > 10000) return console.log(`[woordketting] Woordenlijst geladen: ${words.size} woorden`);
    }
  } catch { /* opnieuw downloaden */ }
  for (const url of SOURCES) {
    try {
      const set = parse(await download(url));
      if (set.size < 10000) throw new Error(`maar ${set.size} woorden`);
      words = set;
      fs.mkdirSync(path.dirname(CACHE), { recursive: true });
      fs.writeFileSync(CACHE, [...set].join('\n'));
      return console.log(`[woordketting] Woordenlijst gedownload: ${set.size} woorden (${url.split('/').slice(-2).join('/')})`);
    } catch (e) {
      console.warn(`[woordketting] Downloaden mislukt (${url.split('/').pop()}): ${e.message}`);
    }
  }
  words = null;
  console.warn('[woordketting] Geen woordenlijst: woorden worden niet gecontroleerd');
}

// true = bestaat, false = bestaat niet, null = geen lijst (dan niet controleren)
const exists = (word) => (words ? words.has(normalize(word)) : null);

module.exports = { load, exists };
