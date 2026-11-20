// ============================================================
//  INSTELLINGEN TICKETSYSTEEM
// ============================================================

module.exports = {
  // ---- Kanalen en rollen (rechtermuisknop → ID kopiëren, met Ontwikkelaarsmodus aan) ----
  // Staan ze hier ingevuld, dan is /ticket-setup niet nodig.
  panelChannelId: '1516461284374216774', // kanaal waar het ticketpaneel staat
  staffRoleId: '',         // ziet Vragen-tickets, wordt gegeven bij geaccepteerde sollicitatie
  bestuurRoleId: '',       // ziet Vragen- en Bestuur-tickets
  transcriptChannelId: '', // (optioneel) transcripts van gesloten tickets
  partnerChannelId: '1571121191614283919', // (optioneel) geaccepteerde partners
  partnerRoleId: '',       // (optioneel) rol voor partners
  extraStaffRoleId: '',    // (optioneel) tweede keuze bij accepteren sollicitatie

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
  // categoryId: categorie waar de tickets van deze soort in komen
    { id: 'vragen', label: 'Vragen', emoji: '❓', description: 'Heb je een vraag? Wij helpen je graag.', team: ['staff', 'bestuur'], categoryId: '1543971187560808570' },
    { id: 'bestuur', label: 'Bestuur', emoji: '👑', description: 'Zaken die alleen voor het bestuur zijn.', team: ['bestuur'], categoryId: '1545140372995309568' },
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
