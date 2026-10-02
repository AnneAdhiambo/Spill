import { SimplePool, finalizeEvent } from "nostr-tools";
import type { Event, Filter } from "nostr-tools";
import { unlockIdentity, hasStoredIdentity } from "../../features/identity/keys";
import {
  communities as mockCommunities,
  reports as mockReports,
  type ReportItem,
  type SensitiveReason,
} from "../../data/communityReports";

export type Community = {
  id: string;
  name: string;
  description: string;
  members: string;
  tone: string;
};

export type CommunityPost = {
  imageAlt: any;
  id: string;
  content: string;
  pubkey: string;
  createdAt: number;
  likes?: number;
  comments?: number;
  authorName?: string;
  imageUrl?: string;

  sensitiveReason?: SensitiveReason;
};

export type PostAttachment = {
  imageUrl: string;
  imageAlt: string;
  sensitiveReason?: SensitiveReason;
};

const RELAYS = ["wss://relay.damus.io", "wss://relay.nostr.band"];
const pool = new SimplePool();

// Dummy admin pubkey for addressable tags
const DUMMY_ADMIN_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000000";

class CommunityService {
  private readonly localPostsKey = "spill.community-posts";

  async getCommunities(): Promise<Community[]> {
    return mockCommunities.map((c, index) => ({
      id: `group-${index}`,
      name: c.name,
      description: c.description,
      members: c.members,
      tone: c.tone,
    }));
  }

  async getCommunity(id: string): Promise<Community | undefined> {
    const communities = await this.getCommunities();
    return communities.find((c) => c.id === id);
  }

  async joinCommunity(communityId: string, passcode: string): Promise<void> {
    if (!hasStoredIdentity()) throw new Error("No identity found. Please sign in first.");
    
    const { privateKeyHex } = await unlockIdentity(passcode);
    const sk = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
    const event = finalizeEvent({
      kind: 9021,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["a", `39000:${DUMMY_ADMIN_PUBKEY}:${communityId}`],
        ["h", communityId]
      ],
      content: "",
    }, sk);

    await Promise.any(pool.publish(RELAYS, event));
    
    // Save to localStorage
    const joined = this.getJoinedCommunities();
    if (!joined.includes(communityId)) {
      joined.push(communityId);
      localStorage.setItem("spill.joined", JSON.stringify(joined));
    }
  }

  getJoinedCommunities(): string[] {
    const raw = localStorage.getItem("spill.joined");
    return raw ? JSON.parse(raw) : [];
  }

  async getPosts(communityId: string): Promise<(CommunityPost | ReportItem)[]> {
    const filter: Filter = {
      kinds: [1],
      "#a": [`39000:${DUMMY_ADMIN_PUBKEY}:${communityId}`],
      limit: 50,
    };

    let events: Event[] = [];
    try {
      events = await pool.querySync(RELAYS, filter);
    } catch (err) {
      console.warn("Relay query failed", err);
    }

    const remotePosts = events
        .sort((a, b) => b.created_at - a.created_at)
        .map((ev) => ({
          id: ev.id,
          content: ev.content,
          pubkey: ev.pubkey,
          createdAt: ev.created_at,
          likes: 0,
          comments: 0,
        }));

    const localPosts = this.getLocalPosts(communityId);
    const localPostsById = new Map(localPosts.map((post) => [post.id, post]));
    const remotePostIds = new Set(remotePosts.map((post) => post.id));
    const uniqueLocalPosts = localPosts.filter((post) => !remotePostIds.has(post.id));
    const hydratedRemotePosts = remotePosts.map((post) => {
      const localPost = localPostsById.get(post.id);
      return localPost?.imageUrl ? { ...post, ...localPost } : post;
    });

    if (hydratedRemotePosts.length > 0 || uniqueLocalPosts.length > 0) {
      return [...uniqueLocalPosts, ...hydratedRemotePosts];
    }

    const mockId = communityId === "group-1" ? "gbv" : communityId === "group-2" ? "journalism" : "activism";
    const filteredMock = mockReports.filter(r => r.community === mockId || r.community === "activism");
    
    return filteredMock;
  }

  async createPost(
    communityId: string,
    content: string,
    passcode: string,
    attachment?: PostAttachment,
  ): Promise<CommunityPost> {
    if (!hasStoredIdentity()) throw new Error("Please sign in first.");
    
    const { privateKeyHex, npub } = await unlockIdentity(passcode);
    const sk = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    const event = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["a", `39000:${DUMMY_ADMIN_PUBKEY}:${communityId}`],
        ["h", communityId]
      ],
      content,
    }, sk);

    try {
      await Promise.any(pool.publish(RELAYS, event));
    } catch (error) {
      console.warn("Post could not reach a relay and was saved locally instead.", error);
    }

    const post: CommunityPost = {
      id: event.id,
      content: event.content,
      pubkey: event.pubkey,
      authorName: npub.slice(0, 10) + "...",
      createdAt: event.created_at,
      likes: 0,
      comments: 0,
      ...attachment,
    };

    this.saveLocalPost(communityId, post);
    return post;
  }

  private getLocalPosts(communityId: string): CommunityPost[] {
    try {
      const stored = localStorage.getItem(this.localPostsKey);
      if (!stored) return [];
      const posts = JSON.parse(stored) as Array<CommunityPost & { communityId: string }>;
      return posts
        .filter((post) => post.communityId === communityId)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  private saveLocalPost(communityId: string, post: CommunityPost): void {
    try {
      const stored = localStorage.getItem(this.localPostsKey);
      const posts = stored ? JSON.parse(stored) as Array<CommunityPost & { communityId: string }> : [];
      localStorage.setItem(this.localPostsKey, JSON.stringify([{ ...post, communityId }, ...posts]));
    } catch (error) {
      console.warn("Could not save the local community post.", error);
    }
  }
  
  hasIdentity(): boolean {
    return hasStoredIdentity();
  }
}

export const communityService = new CommunityService();
