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
    bio: 'Curieuse de tout. Apprend ActivityPods.',
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
    name: 'Nicolas Bariès',
    bio: 'Écrit sur la mobilité douce et les communs européens.',
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
  {
    id: 'vision-train-network',
    authorId: 'philippe',
    title: 'Now, here is a vision that I would love to make a reality',
    paragraphs: [
      'This is Starline, a blueprint for an EU high speed train network, created by the think tank 21st Europe. Unfortunately, it is far away from our current reality.',
      'I used to be able to travel by train from Lisbon to Berlin, but since 2020 the connection Lisbon Madrid is cancelled and there is not a single train connection from Portugal to the rest of Europe, insane. (please correct me if someone knows one)',
      'According to 21st Europe, replacing short-haul flights with high-speed rail could cut emissions by 95% and it is 30% faster than cars. Now we just need politicians bold enough to put this into practice. I will leave the link to the beautiful project outline by 21st Europe in the comments, thanks to Nicolas Pariès for showing it to me.'
    ],
    language: 'en',
    createdAt: '2025-02-20',
    publishedAt: '2025-02-20',
    status: 'published',
    approvedBy: ['lucie', 'anton'],
    sources: [
      {
        id: 's1',
        url: 'https://metro.co.uk/2025/03/19/a-new-tube-europe-link-uk-39-european-countries-via-train-22753362',
        title: 'A new tube linking 39 European countries via train',
        publisher: 'Metro'
      }
    ],
    about: {
      title: 'What if, instead of investing billions in AI, we built a European train network?',
      author: 'Nicolas Pariès'
    }
  },
  {
    id: 'we-need-night-trains',
    authorId: 'nicolas',
    title: 'We need night trains!',
    paragraphs: [
      "Odio nibh eget nibh felis in. Diam enim sit enim eu fringilla sed. Risus consectetur feugiat est tellus vel donec nunc. Vulputate ut non maecenas lectus natoque in auctor. Mauris urna ut urna magna. Mattis et fames faucibus mauris pellentesque at arcu varius. Imperdiet eu mi nibh scelerisque posuere nulla. Lectus pulvinar pellentesque mattis congue pulvinar potenti sagittis viverra nullam. Nec arcu condimentum a ut. Pellentesque egestas magna tortor purus quam ut lorem ullamcorper massa.",
      "Neque id condimentum non ac ut. Mi amet consectetur mollis vestibulum cras condimentum tristique. Faucibus magna quam sit fermentum. Lectus accumsan suspendisse interdum et consequat facilisi ornare id. Sagittis orci magna proin est diam."
    ],
    language: 'en',
    createdAt: '2025-05-07',
    publishedAt: '2025-05-07',
    status: 'published',
    respondsTo: {
      id: 'vision-train-network',
      title: 'Now, here is a vision that I would love to make a reality',
      authorId: 'philippe',
      publishedAt: '2025-02-20'
    },
    approvedBy: ['lucie', 'philippe'],
    sources: [
      {
        id: 's2',
        url: 'https://21st.europe/starline',
        title: 'Starline — A blueprint for EU high-speed rail',
        publisher: '21st Europe'
      }
    ]
  }
];

export const comments: Comment[] = [
  {
    id: 'c1',
    letterId: 'vision-train-network',
    authorId: 'nicolas',
    paragraphs: ['Thanks for sharing Philippe!'],
    publishedAt: '2025-02-22',
    approvedBy: ['stephanie'],
    about: {
      title: 'Now, here is a vision that I would love to make a reality',
      author: 'Philippe Birker'
    }
  },
  {
    id: 'c2',
    letterId: 'vision-train-network',
    authorId: 'stanislava',
    paragraphs: [
      "Really sad to see Bratislava not on that picture. It's the easiest connection to make, Vienna, Bratislava, Budapest.",
      "The famous triangle of 3 capital cities each an hour from each other… shame you chose to leave one member of EU, right in the heart of Europe, out of your picture"
    ],
    publishedAt: '2025-02-23',
    approvedBy: ['stephanie'],
    about: {
      title: 'Now, here is a vision that I would love to make a reality',
      author: 'Philippe Birker'
    }
  }
];

export const currentUser = users.alice;

export const dailyLimit = { used: 5, max: 17 };
