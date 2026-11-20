// ============================================================
//  INSTELLINGEN TICKETSYSTEEM
//  Kanalen en rollen stel je in met /ticket-setup (wordt opgeslagen in data/settings.json).
// ============================================================

module.exports = {
  // Eigenaar: krijgt staff-sollicitaties en partneraanvragen in zijn DM en handelt ze af
  ownerId: '1506618917324460114',

  // Mogen /ticket-setup gebruiken
  adminIds: ['1057307298894196756', '1506618917324460114'],

  color: '#F0C14B', // goud, past bij het logo
  categoryName: '🎫 TICKETS',

  // Na een afwijzing pas na zoveel dagen opnieuw solliciteren
  cooldownDays: 7,

  // Keuzes in het ticketmenu.
  // team: welke rollen uit /ticket-setup het ticket kunnen zien ('staff' en/of 'bestuur')
  types: [
    { id: 'vragen', label: 'Vragen', emoji: '❓', description: 'Heb je een vraag? Wij helpen je graag.', team: ['staff', 'bestuur'] },
    { id: 'bestuur', label: 'Bestuur', emoji: '👑', description: 'Zaken die alleen voor het bestuur zijn.', team: ['bestuur'] },
    { id: 'staff', label: 'Staff sollicitatie', emoji: '🛡️', description: 'Solliciteren voor staff? Vul het formulier in.' },
    { id: 'partner', label: 'Partner aanvraag', emoji: '🤝', description: 'Partner worden met jouw server? Vul het formulier in.' },
  ],

  // Vragen van het sollicitatieformulier (max. 5)
  questions: [
    { id: 'waarom', label: 'Waarom wil je staff worden?', style: 'long', required: true },
    { id: 'ervaring', label: 'Ervaring als moderator/staff? Waar?', style: 'long', required: true },
    { id: 'uren', label: 'Hoeveel uur per week ben je actief?', style: 'short', required: true },
    { id: 'situatie', label: 'Wat doe je als iemand blijft schelden?', style: 'long', required: true },
    { id: 'extra', label: 'Wil je nog iets toevoegen?', style: 'long', required: false },
  ],
};
