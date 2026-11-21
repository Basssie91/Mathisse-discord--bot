// "Made by Basssie91" onder elke embed van de bot.
// Heeft een embed al een voettekst, dan komt het erachter: "Tekst • Made by Basssie91".
const { EmbedBuilder } = require('discord.js');

const CREDIT = 'Made by Basssie91';
const original = EmbedBuilder.prototype.toJSON;

EmbedBuilder.prototype.toJSON = function toJSON(...args) {
  const data = original.apply(this, args);
  const text = data.footer?.text;
  if (!text) data.footer = { ...data.footer, text: CREDIT };
  else if (!text.includes(CREDIT)) data.footer = { ...data.footer, text: `${text} • ${CREDIT}`.slice(0, 2048) };
  return data;
};

module.exports = { CREDIT };
