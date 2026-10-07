import type { FeedPost } from "./feedEvent"

/**
 * DEMO ONLY. Mock posts for the Independent Journalism community.
 * They exist only in memory in useCommunityPosts: never signed, never queued in the
 * sync engine, never published to any relay. Images live in public/demo-posts/.
 */
export const DEMO_COMMUNITY_ID = "group-2" // Independent Journalism

/** Featured Youth Voices card shown at the top of the all-posts feed. */
export const FEATURED_POST: FeedPost = {
  id: "demo-one-term-delayed",
  pubkey: "",
  createdAt: Math.floor(Date.now() / 1000),
  text: "Wantam delayed is not one term denied.",
  communityId: "group-4", // Youth Voices
  photoSha256: null,
  photoSrc: "/demo-posts/wantam-delayed.jpeg",
  photoAlt: "Protesters holding a sign that reads Wantam delayed is not one term denied",
  sensitiveReason: null,
  onRelay: false,
  isDemo: true,
}

const H = 3600
const now = Math.floor(Date.now() / 1000)

type Demo = { n: string; hoursAgo: number; text: string; sensitive?: "violence" | "death" }

const DEMOS: Demo[] = [
  { n: "01", hoursAgo: 1, text: "Activist Mulinge Muteti reportedly found after days missing." },
  { n: "02", hoursAgo: 3, text: "I was a few metres from this corner when the tear gas started. Everyone's eyes were burning and the smoke was so thick I lost my friends for ten minutes. I'm writing this from a shop where we sheltered." },
  { n: "03", hoursAgo: 5, text: "Two coffins were left in the middle of the road in town today. Nobody said a word, people just stood and watched. I don't have the names, so I'm only posting what I saw.", sensitive: "death" },
  { n: "04", hoursAgo: 6, text: "I helped carry this young man out of the crowd. He was bleeding badly and we ran to find a motorbike to take him to hospital. I don't know how he is now. Please tell me if you hear anything.", sensitive: "violence" },
  { n: "05", hoursAgo: 9, text: "I watched two officers grab a man by his shirt and drag him across the street. I couldn't tell if he had done anything. I kept filming from a distance and I'm keeping the original safe.", sensitive: "violence" },
  { n: "06", hoursAgo: 11, text: "Two women were sitting against the fence when an officer swung a baton at them. They had their hands up. I was across the street and I can still hear the shouting.", sensitive: "violence" },
  { n: "07", hoursAgo: 14, text: "The water cannon here was pink, a dye that sticks to skin and clothes. I saw people slip and fall as they ran. For anyone caught in it, wash off with lots of water and keep your eyes clear." },
  { n: "08", hoursAgo: 20, text: "I joined the march in Lagos today. Hundreds of us, mostly young people, shouting for change. The mood was loud but peaceful where I stood." },
  { n: "09", hoursAgo: 26, text: "This woman held up her cooking pot and shouted about hunger. I've never forgotten that image. Prices at my local market doubled this year, and I know families skipping meals." },
  { n: "10", hoursAgo: 30, text: "I stood with families holding photos of their missing loved ones outside the president's office. Some had come since morning with no answers. They just want to know where their children are." },
  { n: "11", hoursAgo: 48, text: "Following a murder trial closely. A protected witness said he was told to delete CCTV footage at the police station but formatted the drive instead. I'm trying to confirm the details through the court record before I say more." },
]

export const DEMO_POSTS: FeedPost[] = DEMOS.map((d) => ({
  id: `demo-${d.n}`,
  pubkey: "",
  createdAt: now - d.hoursAgo * H,
  text: d.text,
  communityId: DEMO_COMMUNITY_ID,
  photoSha256: null,
  photoSrc: `/demo-posts/post-${d.n}.jpg`,
  sensitiveReason: d.sensitive ?? null,
  onRelay: false,
  isDemo: true,
}))
