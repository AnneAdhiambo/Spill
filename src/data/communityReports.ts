export type CommunityKey =
  | "all"
  | "activism"
  | "gbv"
  | "journalism"
  | "human-rights"
  | "climate"
  | "youth";

export type SensitiveReason = "gender-based violence" | "violence" | "death";

export type ReportItem = {
  id: string;
  community: Exclude<CommunityKey, "all">;
  identityMode: "PSEUDONYMOUS" | "PROTECTED" | "ANONYMOUS";
  timeAgo: string;
  title: string;
  excerpt: string;
  likes: number;
  comments: number;
  zaps?: number;
  translateLabel?: string;
  mediaVerified?: boolean;
  imageUrl?: string;
  imageAlt?: string;
  sensitiveReason?: SensitiveReason;
};

export const communityTabs: { key: CommunityKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "activism", label: "Activism" },
  { key: "gbv", label: "GBV Support" },
  { key: "journalism", label: "Independent Journalism" },
  { key: "human-rights", label: "Human Rights" },
  { key: "climate", label: "Climate" },
  { key: "youth", label: "Youth Voices" },
];

export const reports: ReportItem[] = [
  {
    id: "report-activism",
    community: "activism",
    identityMode: "PSEUDONYMOUS",
    timeAgo: "12 min ago",
    title: "Residents speak out about the rising cost of living",
    excerpt:
      "Community members gathered to call for affordable food, dignified work and a stronger response to the pressures families are facing.",
    likes: 248,
    comments: 36,
    zaps: 21,
    mediaVerified: true,
    imageUrl: "/assets/protest-hunger.jpeg",
    imageAlt: "A demonstrator holding a pot during a public protest.",
  },
  {
    id: "report-gbv",
    community: "gbv",
    identityMode: "PROTECTED",
    timeAgo: "2 hours ago",
    title: "Communities call for action to end femicide",
    excerpt:
      "Survivors and advocates are sharing resources, asking for stronger protections, and calling for every community to take gender-based violence seriously.",
    likes: 312,
    comments: 52,
    zaps: 50,
    translateLabel: "Translate to English",
    mediaVerified: true,
    imageUrl: "/assets/protest-femicide.jpeg",
    imageAlt: "A public demonstration calling for an end to femicide.",
    sensitiveReason: "gender-based violence",
  },
  {
    id: "report-journalism",
    community: "journalism",
    identityMode: "ANONYMOUS",
    timeAgo: "5 hours ago",
    title: "Witnesses document the impact of unrest on civilians",
    excerpt:
      "This report contains distressing visual evidence. Community reporters are asking for protection for civilians and support for people affected by violence.",
    likes: 189,
    comments: 28,
    zaps: 100,
    mediaVerified: true,
    imageUrl: "/assets/injured-protest.jpeg",
    imageAlt: "A graphic scene showing people carrying an injured person during unrest.",
    sensitiveReason: "violence",
  },
  {
    id: "report-human-rights",
    community: "human-rights",
    identityMode: "PROTECTED",
    timeAgo: "Yesterday",
    title: "A community remembers lives lost and calls for accountability",
    excerpt:
      "People gathered in remembrance and called for a transparent response, support for affected families, and the protection of human dignity.",
    likes: 96,
    comments: 18,
    translateLabel: "Translate to English",
    mediaVerified: true,
    imageUrl: "/assets/memorial-coffins.jpeg",
    imageAlt: "A public memorial scene containing coffins.",
    sensitiveReason: "death",
  },
  {
    id: "report-climate",
    community: "climate",
    identityMode: "PSEUDONYMOUS",
    timeAgo: "Yesterday",
    title: "Neighbours organise around safer, cleaner public spaces",
    excerpt:
      "Residents are mapping environmental concerns and coordinating local action around drainage, waste collection and public health.",
    likes: 143,
    comments: 24,
    translateLabel: "Translate to English",
    mediaVerified: true,
    imageUrl: "/assets/post-activism.png",
    imageAlt: "A young person holding a placard during a public demonstration.",
  },
  {
    id: "report-youth",
    community: "youth",
    identityMode: "ANONYMOUS",
    timeAgo: "2 days ago",
    title: "Young organisers open space for local stories",
    excerpt:
      "Young people are collecting experiences about work, education and safety to shape a community-led agenda for the year ahead.",
    likes: 207,
    comments: 31,
    zaps: 12,
    mediaVerified: true,
    imageUrl: "/assets/post-journalism.png",
    imageAlt: "A reporter wearing a PRESS vest documenting a community scene.",
  },
];

export const communities = [
  {
    name: "Activists",
    members: "3.2K members",
    description: "Civic action, social change and community organising.",
    tone: "green",
  },
  {
    name: "GBV Support",
    members: "1.8K members",
    description: "A safe space for survivors, support and resources.",
    tone: "red",
  },
  {
    name: "Independent Journalism",
    members: "4.1K members",
    description: "For independent reporters, citizen journalists and media supporters.",
    tone: "blue",
  },
  {
    name: "Climate & Environment",
    members: "2.6K members",
    description: "Discussions on climate action, conservation and environmental justice.",
    tone: "green",
  },
  {
    name: "Youth Voices",
    members: "3.9M members",
    description: "A space for young people to share ideas, experiences and drive change.",
    tone: "orange",
  },
];
