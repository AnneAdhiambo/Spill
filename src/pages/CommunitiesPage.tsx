import { useEffect, useState, useCallback } from "react"
import CommunityHeader from "../components/communities/CommunityHeader"
import CommunitySidebar from "../components/communities/CommunitySidebar"
import CommunityFeed from "../components/communities/CommunityFeed"
import PostComposer from "../components/communities/PostComposer"
import CommunityCard from "../components/communities/CommunityCard"
import TopNavbar from "../components/communities/TopNavbar"
import { communityService, type Community, type CommunityPost } from "../services/nostr/communityService"
import type { ReportItem } from "../data/communityReports"
import "../styles/communities.css"

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [posts, setPosts] = useState<(CommunityPost | ReportItem)[]>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  
  // Track joined communities at the app level to reflect state changes immediately
  const [joinedIds, setJoinedIds] = useState<string[]>([]);

  const loadJoinedState = useCallback(() => {
    setJoinedIds(communityService.getJoinedCommunities());
  }, []);

  useEffect(() => {
    async function loadCommunities() {
      try {
        const data = await communityService.getCommunities();
        setCommunities(data);
        loadJoinedState();
      } catch (err) {
        console.error("Failed to load communities", err);
      } finally {
        setLoadingCommunities(false);
      }
    }
    loadCommunities();
  }, [loadJoinedState]);

  const loadPosts = useCallback(async (communityId: string) => {
    setLoadingPosts(true);
    try {
      const data = await communityService.getPosts(communityId);
      setPosts(data);
    } catch (err) {
      console.error("Failed to load posts", err);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    if (activeCommunityId) {
      loadPosts(activeCommunityId);
    }
  }, [activeCommunityId, loadPosts]);

  const activeCommunity = communities.find(c => c.id === activeCommunityId) || null;
  const isJoined = activeCommunityId ? joinedIds.includes(activeCommunityId) : false;

  const handleJoinSuccess = () => {
    loadJoinedState();
  };

  return (
    <div className="communities-page page-shell">
      <TopNavbar />
      
      {!activeCommunityId ? (
        <main className="communities-discovery" style={{ width: 'min(900px, calc(100% - 32px))', margin: '32px auto 60px' }}>
          <header style={{ marginBottom: '24px', padding: '0 12px' }}>
            <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Communities</h1>
            <p style={{ fontSize: '17px', color: 'var(--muted)', maxWidth: '600px' }}>
              Join topic-based communities to connect, share experiences and collaborate on solutions.
            </p>
          </header>
          
          {loadingCommunities ? (
            <p style={{ padding: '0 12px' }}>Loading communities...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {communities.map((community, idx) => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  index={idx}
                  isJoined={joinedIds.includes(community.id)}
                  onExplore={setActiveCommunityId}
                  onJoinSuccess={handleJoinSuccess}
                />
              ))}
            </div>
          )}
        </main>
      ) : (
        <main className="communities-layout">
          <section className="main-column">
            <CommunityHeader 
              community={activeCommunity} 
              loading={loadingCommunities} 
              isJoined={isJoined}
              onJoinSuccess={handleJoinSuccess}
              onBack={() => setActiveCommunityId(null)}
            />
            
            {activeCommunityId && (
              <div className="composer-wrapper" style={{ marginBottom: "2rem", padding: "0 1.5rem" }}>
                <PostComposer 
                  communityId={activeCommunityId} 
                  onPostPublished={() => loadPosts(activeCommunityId)} 
                />
              </div>
            )}

            {loadingPosts ? (
              <p style={{ padding: "0 1.5rem" }}>Loading posts...</p>
            ) : activeCommunityId ? (
              <CommunityFeed reports={posts} />
            ) : null}
          </section>
          
          <CommunitySidebar 
            communities={communities} 
            activeCommunityId={activeCommunityId}
            onSelectCommunity={setActiveCommunityId}
          />
        </main>
      )}
    </div>
  )
}
