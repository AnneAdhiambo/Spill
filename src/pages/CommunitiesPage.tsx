import { useCallback, useEffect, useState } from "react";
import CommunityHeader from "../components/communities/CommunityHeader";
import CommunitySidebar from "../components/communities/CommunitySidebar";
import PostCard, { PostButtonPanel } from "../components/communities/PostCard";
import PostComposer from "../components/communities/PostComposer";
import TopNavbar from "../components/communities/TopNavbar";
import PwaInstallSticker from "../components/layout/PwaInstallSticker";
import NearbySyncCard from "../features/offline/NearbySyncCard";
import { useCommunityPosts } from "../features/post/useCommunityPosts";
import { communityService, type Community } from "../services/nostr/communityService";
import "../styles/communities.css";
import "../styles/postcard.css";

/** Her inline composer is hidden (not deleted); posting happens on /post. */
const SHOW_INLINE_COMPOSER = false;

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [joinedIds, setJoinedIds] = useState<string[]>([]);

  const loadJoinedState = useCallback(() => setJoinedIds(communityService.getJoinedCommunities()), []);

  useEffect(() => {
    async function loadCommunities() {
      try {
        setCommunities(await communityService.getCommunities());
        loadJoinedState();
      } catch (error) {
        console.error("Failed to load communities", error);
      } finally {
        setLoadingCommunities(false);
      }
    }
    loadCommunities();
  }, [loadJoinedState]);

  const { posts, state, refreshLocal } = useCommunityPosts(activeCommunityId, communities.map((c) => c.id));

  const activeCommunity = communities.find((community) => community.id === activeCommunityId) ?? null;
  const isJoined = activeCommunityId ? joinedIds.includes(activeCommunityId) : false;

  // Join from a card: same sign-in check as the sidebar, then open that community,
  // where her header runs the join (passcode) flow.
  const joinFromCard = (communityId: string) => {
    if (!communityService.hasIdentity()) {
      window.location.href = "/get-started";
      return;
    }
    setActiveCommunityId(communityId);
  };

  return (
    <div className="communities-page page-shell">
      <TopNavbar />
      <main className="communities-layout">
        <section className="main-column">
          <NearbySyncCard onReceived={() => void refreshLocal()} />
          {activeCommunityId ? (
            <>
              <CommunityHeader community={activeCommunity} loading={loadingCommunities} isJoined={isJoined} onJoinSuccess={loadJoinedState} onBack={() => setActiveCommunityId(null)} />
              {isJoined && <PostButtonPanel communityId={activeCommunityId} />}
              {SHOW_INLINE_COMPOSER && (
                <div className="composer-wrapper">
                  <PostComposer communityId={activeCommunityId} onPostPublished={() => void refreshLocal()} />
                </div>
              )}
            </>
          ) : (
            <header className="posts-heading"><h1>Posts</h1></header>
          )}

          {state === "loading" && posts.length === 0 && <p className="feed-status">Loading posts...</p>}
          {state === "error" && posts.length === 0 && <p className="feed-status feed-status-error" role="alert">Couldn't reach any relay, so no posts can be shown right now.</p>}
          {state === "ready" && posts.length === 0 && <p className="empty-feed">No posts yet</p>}
          <section className="feed-list" aria-label="Community posts" aria-live="polite">
            {posts.map((post) => {
              const index = communities.findIndex((c) => c.id === post.communityId);
              return (
                <PostCard
                  key={post.id}
                  post={post}
                  community={index >= 0 ? communities[index] : null}
                  communityIndex={Math.max(index, 0)}
                  showCommunity={!activeCommunityId}
                  isJoined={post.communityId ? joinedIds.includes(post.communityId) : false}
                  onSelectCommunity={setActiveCommunityId}
                  onJoin={joinFromCard}
                />
              );
            })}
          </section>
        </section>
      <CommunitySidebar communities={communities} activeCommunityId={activeCommunityId} joinedIds={joinedIds} onSelectCommunity={setActiveCommunityId} onJoinSuccess={loadJoinedState} />
      </main>
      <PwaInstallSticker />
    </div>
  );
}
