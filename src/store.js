// Kleine JSON-opslag in de map data/ (staat niet op GitHub)
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'data');

function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')); } catch { return fallback; }
}
function save(name, value) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, name), JSON.stringify(value, null, 2));
}
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ts = (ms, f = 'R') => `<t:${Math.floor(ms / 1000)}:${f}>`;

module.exports = { load, save, newId, ts };
