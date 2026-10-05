// Cricket ECO Solutions demo data. The frontend keeps the same navigation
// pattern as the reference platform, but this is a separate ECO build.

const VENUES = [
  { id: 1, name: 'National Federation Office', city: 'Johannesburg' },
  { id: 2, name: 'Regional Cricket Hub', city: 'Cape Town' },
  { id: 3, name: 'Provincial Development Centre', city: 'Durban' },
  { id: 4, name: 'District Cricket Office', city: 'Centurion' },
  { id: 5, name: 'Community Club Pilot', city: 'Gqeberha' },
];

const ROLES = [
  {
    id: 1,
    name: 'Player Production',
    department: 'Talent Pathway',
    description: 'A structured player development pathway from grassroots cricket to club, district, regional and national level.',
    minQualifications: [
      'Promising players are tracked consistently instead of being missed in spreadsheets.',
      'Selectors and coaches can review development history, current form and progression status.',
      'Squad lists and shortlists are based on visible records, notes and performance trends.',
    ],
    coreDuties: [
      'Player profiles with age group, role, batting style, bowling style, history and achievements.',
      'Talent identification records, scouting notes and individual development plans.',
      'Performance tracking for match statistics, fitness tests and skills assessments.',
      'Pathway stages with coach feedback, progression status and selection shortlists.',
    ],
    pass_threshold: 70,
    keywords: ['player', 'talent', 'pathway', 'scouting', 'performance', 'selection'],
  },
  {
    id: 2,
    name: 'Database Management',
    department: 'Federation Records',
    description: 'A secure central register for players, clubs, coaches, umpires, scorers and federation officials.',
    minQualifications: [
      'One trusted database replaces duplicated paper forms, messaging threads and scattered files.',
      'Administrators gain stronger control over who can see or edit personal information.',
      'Documents and certificates can be linked to the right person or club record.',
    ],
    coreDuties: [
      'Registration records for players, clubs, coaches, umpires, scorers and officials.',
      'Role-based access, permissions, document storage and consent records.',
      'Duplicate checks, data validation, audit trail, Excel or CSV import and export.',
      'Automatic backups and open formats for future integration.',
    ],
    pass_threshold: 70,
    keywords: ['database', 'records', 'registration', 'documents', 'permissions', 'audit'],
  },
  {
    id: 3,
    name: 'Reports Basket',
    department: 'Board Reporting',
    description: 'Ready-made and custom reports for the board, selectors, administrators, funders and partners.',
    minQualifications: [
      'Board and funder reports can be prepared in minutes instead of weeks.',
      'Decision-makers gain dashboards for participation, progress, clubs and accreditation.',
      'Users can save frequently used reports and export them when needed.',
    ],
    coreDuties: [
      'Participation, player progress, club activity and coach accreditation reports.',
      'Custom report builder with filters, dashboards and charts.',
      'Export to PDF or Excel with scheduled email delivery.',
      'Saved reports per user so regular packs stay easy to repeat.',
    ],
    pass_threshold: 70,
    keywords: ['reports', 'dashboard', 'charts', 'board', 'excel', 'pdf', 'analytics'],
  },
  {
    id: 4,
    name: 'Fixtures',
    department: 'Competition Operations',
    description: 'League and tournament scheduling, venue allocation, scoring, results, tables and notifications.',
    minQualifications: [
      'Fixture changes, postponements and results are communicated from one source.',
      'Tables, standings and player statistics become easier to trust.',
      'Competition administrators can plan venues, umpires and match activity in one place.',
    ],
    coreDuties: [
      'League and tournament creation with automatic fixture generation.',
      'Venue and umpire allocation for competitions and events.',
      'Live scoring, result entry, tables, standings and player statistics.',
      'Rescheduling, postponement notices, push notifications, SMS and email alerts.',
    ],
    pass_threshold: 70,
    keywords: ['fixtures', 'league', 'tournament', 'scoring', 'results', 'standings'],
  },
  {
    id: 5,
    name: 'Empowerment',
    department: 'Training and Compliance',
    description: 'A training hub for coaching, administration, safeguarding, anti-corruption and first aid certification.',
    minQualifications: [
      'The federation can see who is trained, certified and due for renewal.',
      'Clubs gain a clearer route to better coaching, governance and safe cricket standards.',
      'Certificates connect directly to the central database instead of living in separate files.',
    ],
    coreDuties: [
      'Coaching modules, levels, assessments and certificates.',
      'Club governance, finance and event management training.',
      'Safeguarding policies, mandatory courses, incident reporting and renewal reminders.',
      'Anti-corruption education, code of conduct sign-off, first aid schedules and expiry alerts.',
    ],
    pass_threshold: 70,
    keywords: ['training', 'certificates', 'coaching', 'safeguarding', 'anti-corruption', 'first aid'],
  },
];

function scoreCvText(text, keywords) {
  const normalized = (text || '').toLowerCase();
  const matched = keywords.filter((k) => normalized.includes(k.toLowerCase()));
  const missing = keywords.filter((k) => !matched.includes(k));
  const score = keywords.length ? Math.round((matched.length / keywords.length) * 100) : null;
  return { score, matched, missing };
}

function universalKnockouts(role) {
  return [
    { id: `${role.id}-u1`, is_knockout: true, pass_option: 'A',
      question: 'Is your federation or cricket organisation ready to participate in a discovery workshop for this module?',
      option_a: 'Yes, we can participate', option_b: 'Not yet' },
    { id: `${role.id}-u2`, is_knockout: true, pass_option: 'A',
      question: 'Do you agree that sensitive player and child data must be handled only by authorised users?',
      option_a: 'Yes, authorised access only', option_b: 'No / unsure' },
  ];
}

function questionsForRole(role) {
  return [
    ...universalKnockouts(role),
    { id: `${role.id}-s1`, is_knockout: false,
      question: `How important is ${role.name} for your first rollout?`,
      option_a: 'Critical for launch', points_a: 10,
      option_b: 'Important after the first phase', points_b: 7,
      option_c: 'Useful later', points_c: 4 },
    { id: `${role.id}-s2`, is_knockout: false,
      question: 'How ready is your current data or process for migration?',
      option_a: 'Clean and available', points_a: 10,
      option_b: 'Available but needs cleaning', points_b: 7,
      option_c: 'Mostly manual or missing', points_c: 3 },
    { id: `${role.id}-s3`, is_knockout: false,
      question: 'Which delivery approach would fit best?',
      option_a: 'Pilot first, then national rollout', points_a: 10,
      option_b: 'Full launch after discovery', points_b: 8,
      option_c: 'Still deciding internally', points_c: 4 },
  ];
}
