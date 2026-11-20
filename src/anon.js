// Personen in superUserIds (Bas) hebben overal toegang, maar worden nergens bij naam genoemd.
// Doet zo iemand iets (ticket oppakken, sollicitatie afhandelen, ...), dan staat er "het team".
const cfg = require('./config');

const isHidden = (id) => (cfg.superUserIds ?? []).includes(id);
// Vermelding (@naam), of de vervangtekst voor verborgen personen
const mention = (user, fallback = 'het team') => (isHidden(user.id) ? fallback : `${user}`);
// Platte naam (zonder @), of de vervangtekst
const name = (user, plain, fallback = 'het team') => (isHidden(user.id) ? fallback : plain);

module.exports = { isHidden, mention, name };
