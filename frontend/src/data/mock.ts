export type User = {
  id: string;
  webId: string;
  name: string;
  bio: string;
  avatarInitials: string;
  avatarColor: string;
  // Optional URL to an actual profile picture. When present, the Avatar
  // component renders an <img>; when absent, it falls back to initials on a
  // colored background. SemApps' getIdentity surfaces this from vcard:photo,
  // foaf:img, or as:icon — whichever the Pod Provider exposes on the WebID.
  avatarUrl?: string;
};

export type Source = {
  id: string;
  url: string;
  title: string;
  publisher?: string;
  author?: string;
};

export type Letter = {
  id: string;
  authorId: string;
  title: string;
  paragraphs: string[];
  language: 'fr' | 'en';
  createdAt: string;
  publishedAt: string;
  status: 'draft' | 'in-review' | 'published';
  respondsTo?: { id: string; title: string; authorId: string; publishedAt: string };
  approvedBy: string[];
  sources: Source[];
  about?: { title: string; author?: string };
  mapImage?: string;
};

export type Comment = {
  id: string;
  letterId: string;
  authorId: string;
  paragraphs: string[];
  publishedAt: string;
  approvedBy: string[];
  about?: { title: string; author?: string };
};

export const users: Record<string, User> = {
  alice: {
    id: 'alice',
    webId: 'https://alice.armoise.co/profile/card#me',
    name: 'Alice (vous)',
    bio: 'Curieuse de tout. Aime les flamants roses et les lapins blancs.',
    avatarInitials: 'A',
    avatarColor: '#c9e265'
  },
  philippe: {
    id: 'philippe',
    webId: 'https://philippe.armoise.co/profile/card#me',
    name: 'Philippe Birker',
    bio:
      "Building a regenerative Agrifood System in Europe with Climate Farmers. Co-founder of Love Foundation, VCA NL & Hug Records. TED Countdown & BMW Responsible Leader. Exploring what is regen culture & regen leadership.",
    avatarInitials: 'PB',
    avatarColor: '#314a62'
  },
  nicolas: {
    id: 'nicolas',
    webId: 'https://nicolas.armoise.co/profile/card#me',
    name: 'Nicolas Pariès',
    bio: 'I do less, but better. Creative partner for purpose-led organisations. Direction, Identities & Code, going low',
    avatarInitials: 'NB',
    avatarColor: '#f7a072'
  },
  stanislava: {
    id: 'stanislava',
    webId: 'https://stanislava.armoise.co/profile/card#me',
    name: 'Stanislava Bilney',
    bio: 'De Bratislava, observe les liens train entre capitales mitteleuropéennes.',
    avatarInitials: 'SB',
    avatarColor: '#8e7cc3'
  },
  lucie: {
    id: 'lucie',
    webId: 'https://lucie.armoise.co/profile/card#me',
    name: 'Lucie Cheras',
    bio: '',
    avatarInitials: 'LC',
    avatarColor: '#e76f51'
  },
  anton: {
    id: 'anton',
    webId: 'https://anton.armoise.co/profile/card#me',
    name: 'Anton Wojkovski',
    bio: '',
    avatarInitials: 'AW',
    avatarColor: '#2a9d8f'
  }
};

export const letters: Letter[] = [
  // The seed letter shown on /read by default in demo mode. The two replies
  // below thread off it so visitors can see how the "responses" UI works.
  {
    id: 'european-train-network',
    authorId: 'nicolas',
    title: 'What if, instead of investing billions in AI, we built a European train network?',
    paragraphs: [
      "Here is Starline, a vision by the think tank 21st Europe. Isn't that what we all need, rather than robots writing copy for LinkedIn? Isn't this a truly exciting vision of our future? And the cherry on the cake: replacing short-haul flights with high-speed trains could cut emissions by 95%."
    ],
    language: 'en',
    createdAt: '2025-02-20',
    publishedAt: '2025-02-20',
    status: 'published',
    approvedBy: ['lucie', 'anton'],
    sources: [
      {
        id: 's1',
        url: 'https://21st.europe/starline',
        title: 'Starline — 21st Europe',
        publisher: '21st Europe'
      }
    ]
  },
  {
    id: 'night-trains-reply',
    authorId: 'philippe',
    title: '',
    paragraphs: [
      "Yes — and the long-distance reach matters as much as the speed. I used to ride Lisbon to Berlin by train; since 2020 the Lisbon-Madrid leg is cancelled and there's not a single train connection from Portugal to the rest of Europe. Insane (please correct me if someone knows one).",
      "Couple high-speed daytime with proper night trains and you've replaced most of the short-haul market. The CO₂ math becomes uncontestable, the experience becomes desirable."
    ],
    language: 'en',
    createdAt: '2025-02-23',
    publishedAt: '2025-02-23',
    status: 'published',
    respondsTo: {
      id: 'european-train-network',
      title: 'What if, instead of investing billions in AI, we built a European train network?',
      authorId: 'nicolas',
      publishedAt: '2025-02-20'
    },
    approvedBy: ['lucie', 'anton'],
    sources: [
      {
        id: 's-night-1',
        url: 'https://www.europeansleeper.eu/en',
        title: 'European Sleeper',
        publisher: 'European Sleeper'
      }
    ]
  },
  {
    id: 'bratislava-reply',
    authorId: 'stanislava',
    title: '',
    paragraphs: [
      "Really sad to see Bratislava not on that map. It's the easiest connection to make: Vienna, Bratislava, Budapest — the famous triangle of three capitals each an hour apart. Shame to leave a member of the EU, right in the heart of Europe, out of the picture."
    ],
    language: 'en',
    createdAt: '2025-02-24',
    publishedAt: '2025-02-24',
    status: 'published',
    respondsTo: {
      id: 'european-train-network',
      title: 'What if, instead of investing billions in AI, we built a European train network?',
      authorId: 'nicolas',
      publishedAt: '2025-02-20'
    },
    approvedBy: ['lucie'],
    sources: [
      {
        id: 's-brat-1',
        url: 'https://en.wikipedia.org/wiki/Vienna%E2%80%93Bratislava_railway',
        title: 'Vienna–Bratislava railway',
        publisher: 'Wikipedia'
      }
    ]
  },
  // Nested reply: a reply to philippe's "night trains" reply, so visitors
  // see how the "N réponses →" counter + permalink behave on the parent
  // reply (the count appears under night-trains-reply and clicking it
  // opens that reply on /read/night-trains-reply where this nested one
  // appears in the inline replies section).
  {
    id: 'night-trains-nested-reply',
    authorId: 'anton',
    title: '',
    paragraphs: [
      "Berlin–Paris is about to come back as a night service in December — small but the direction is right. The hard part isn't the rolling stock, it's the cross-border path allocation; once a few operators run an end-to-end route the rest catches up."
    ],
    language: 'en',
    createdAt: '2025-02-25',
    publishedAt: '2025-02-25',
    status: 'published',
    respondsTo: {
      id: 'night-trains-reply',
      title: '',
      authorId: 'philippe',
      publishedAt: '2025-02-23'
    },
    approvedBy: ['lucie'],
    sources: [
      {
        id: 's-nested-1',
        url: 'https://www.deutschebahn.com/de/presse/pressestart_zentrales_uebersicht/Berlin-Paris-Wir-machen-die-Nacht-zum-Tag-12345678',
        title: 'Berlin–Paris night train returns',
        publisher: 'Deutsche Bahn'
      }
    ]
  },

  // Two example drafts + one in-review for the writing workspace in demo
  // mode. Authored by `alice` (= the mock currentUser) so they show up in
  // the "your drafts" / "your in-review" lists when no real Pod is
  // connected. Visitors land on /write and see what the workspace will
  // look like once they start writing for real.
  {
    id: 'demo-draft-circles',
    authorId: 'alice',
    title: 'Why I joined Kind',
    paragraphs: [
      'Notes I want to expand on before publishing — the move from infinite scroll to a daily 17-action ceiling has changed how I think about reading.'
    ],
    language: 'en',
    createdAt: '2025-06-05',
    publishedAt: '2025-06-05',
    status: 'draft',
    approvedBy: [],
    sources: []
  },
  {
    id: 'demo-draft-untitled',
    authorId: 'alice',
    title: '',
    paragraphs: [],
    language: 'en',
    createdAt: '2025-06-08',
    publishedAt: '2025-06-08',
    status: 'draft',
    approvedBy: [],
    sources: []
  },
  {
    id: 'demo-inreview-trains',
    authorId: 'alice',
    title: 'A first draft about night trains',
    paragraphs: [
      'Currently with my reviewers — three peers from my reading circle.'
    ],
    language: 'en',
    createdAt: '2025-06-06',
    publishedAt: '2025-06-06',
    status: 'in-review',
    approvedBy: [],
    sources: []
  }
];

// Inline comments — kept as scaffolding for the Thread component but the
// demo's read flow leans on full-letter replies (above) rather than comments.
export const comments: Comment[] = [];

export const currentUser = users.alice;

export const dailyLimit = { used: 5, max: 17 };
