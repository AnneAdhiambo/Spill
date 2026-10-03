import { useCallback, useEffect, useState } from "react";
import CommunityFeed from "../components/communities/CommunityFeed";
import CommunityHeader from "../components/communities/CommunityHeader";
import CommunitySidebar from "../components/communities/CommunitySidebar";
import PostComposer from "../components/communities/PostComposer";
import TopNavbar from "../components/communities/TopNavbar";
import PwaInstallSticker from "../components/layout/PwaInstallSticker";
import { reports as mockReports, type ReportItem } from "../data/communityReports";
import { communityService, type Community, type CommunityPost } from "../services/nostr/communityService";
import "../styles/communities.css";

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [posts, setPosts] = useState<(CommunityPost | ReportItem)[]>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
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

  const loadPosts = useCallback(async (communityId: string) => {
    setLoadingPosts(true);
    try {
      setPosts(await communityService.getPosts(communityId));
    } catch (error) {
      console.error("Failed to load posts", error);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    if (activeCommunityId) loadPosts(activeCommunityId);
  }, [activeCommunityId, loadPosts]);

  const activeCommunity = communities.find((community) => community.id === activeCommunityId) ?? null;
  const isJoined = activeCommunityId ? joinedIds.includes(activeCommunityId) : false;

  return (
    <div className="communities-page page-shell">
      <TopNavbar />
      <main className="communities-layout">
        <section className="main-column">
          {activeCommunityId ? (
            <>
              <CommunityHeader community={activeCommunity} loading={loadingCommunities} isJoined={isJoined} onJoinSuccess={loadJoinedState} onBack={() => setActiveCommunityId(null)} />
              <div className="composer-wrapper">
                <PostComposer communityId={activeCommunityId} onPostPublished={() => loadPosts(activeCommunityId)} />
              </div>
              {loadingPosts ? <p className="feed-status">Loading posts...</p> : <CommunityFeed reports={posts} />}
            </>
          ) : (
            <>
              <header className="posts-heading"><h1>Posts</h1></header>
              <CommunityFeed reports={mockReports} />
            </>
          )}
        </section>
      <CommunitySidebar communities={communities} activeCommunityId={activeCommunityId} joinedIds={joinedIds} onSelectCommunity={setActiveCommunityId} onJoinSuccess={loadJoinedState} />
      </main>
      <PwaInstallSticker />
    </div>
  );
}
