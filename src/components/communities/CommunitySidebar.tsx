import { Camera, Heart, Leaf, Users, UsersRound } from "lucide-react";
import { useState } from "react";
import { communityService, type Community } from "../../services/nostr/communityService";

const icons = [Users, Heart, Camera, Leaf, UsersRound]

type CommunitySidebarProps = {
  communities: Community[];
  activeCommunityId: string | null;
  joinedIds: string[];
  onSelectCommunity: (id: string) => void;
  onJoinSuccess: () => void;
};

export default function CommunitySidebar({ communities, activeCommunityId, joinedIds, onSelectCommunity, onJoinSuccess }: CommunitySidebarProps) {
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const beginJoin = (event: React.MouseEvent, communityId: string) => {
    event.stopPropagation();
    if (!communityService.hasIdentity()) {
      window.location.href = "/get-started";
      return;
    }
    setError(null);
    setPasscode("");
    setJoiningId(communityId);
  };

  const confirmJoin = async (event: React.MouseEvent, communityId: string) => {
    event.stopPropagation();
    if (!passcode) {
      setError("Enter your passcode to join.");
      return;
    }
    try {
      await communityService.joinCommunity(communityId, passcode);
      setJoiningId(null);
      setPasscode("");
      onJoinSuccess();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join this community.");
    }
  };

  return (
    <aside className="community-sidebar">
      <section className="sidebar-card">
        <h2>Communities</h2>
        <p>
          Join topic-based communities to connect, share experiences, get support and collaborate on solutions.
        </p>

        <div className="community-list">
          {communities.map((community, index) => {
            const Icon = icons[index % icons.length] ?? Users;
            const isActive = community.id === activeCommunityId;
            const isJoined = joinedIds.includes(community.id);
            return (
              <div 
                className={`community-list-item ${isActive ? "active" : ""}`} 
                key={community.id}
                onClick={() => onSelectCommunity(community.id)}
                style={{ cursor: "pointer", backgroundColor: isActive ? "var(--bg-elevated)" : undefined }}
              >
                <div className="community-icon-wrap">
                  <span className={`community-icon tone-${community.tone}`}>
                    <Icon size={22} />
                  </span>
                  <div>
                    <h3>{community.name}</h3>
                    <strong>{community.members}</strong>
                    <p>{community.description}</p>
                  </div>
                </div>
                <div className="community-sidebar-actions" onClick={(event) => event.stopPropagation()}>
                  {joiningId === community.id ? (
                    <>
                      <input type="password" placeholder="Passcode" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoFocus />
                      <button type="button" onClick={(event) => confirmJoin(event, community.id)}>Confirm</button>
                      {error && <span>{error}</span>}
                    </>
                  ) : (
                    <button type="button" onClick={(event) => beginJoin(event, community.id)} disabled={isJoined}>
                      {isJoined ? "Joined" : "Join"}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="promo-card">
        <img src="/assets/promo-card.png" alt="Stronger communities. A more inclusive Africa." />
      </section>
    </aside>
  )
}
