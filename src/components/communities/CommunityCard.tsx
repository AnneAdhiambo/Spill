import { useState } from "react";
import { Camera, Heart, Leaf, Users, UsersRound } from "lucide-react";
import type { Community } from "../../services/nostr/communityService";
import { communityService } from "../../services/nostr/communityService";
import "../../styles/communities.css";

const icons = [Users, Heart, Camera, Leaf, UsersRound];

type CommunityCardProps = {
  community: Community;
  index: number;
  isJoined: boolean;
  onExplore: (id: string) => void;
  onJoinSuccess: () => void;
};

export default function CommunityCard({ community, index, isJoined, onExplore, onJoinSuccess }: CommunityCardProps) {
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcode, setPasscode] = useState("");
  
  const Icon = icons[index % icons.length] ?? Users;

  const handleJoinClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card click

    if (isJoined) return;

    if (!communityService.hasIdentity()) {
      // Redirect to sign in/get started flow if unauthenticated, per requirements
      window.location.href = "/get-started";
      return;
    }

    if (!showPasscode) {
      setShowPasscode(true);
      return;
    }

    if (!passcode) {
      setError("Passcode required");
      return;
    }

    setIsJoining(true);
    setError(null);
    try {
      await communityService.joinCommunity(community.id, passcode);
      setShowPasscode(false);
      setPasscode("");
      onJoinSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to join. Try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div 
      className="community-discovery-card" 
      onClick={() => onExplore(community.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onExplore(community.id); }}
    >
      <div className="community-card-content">
        <div className="community-icon-wrap">
          <span className={`community-icon tone-${community.tone}`}>
            <Icon size={28} />
          </span>
          <div className="community-info">
            <h2>{community.name}</h2>
            <strong>{community.members}</strong>
            <p>{community.description}</p>
          </div>
        </div>
        
        <div className="community-card-actions" onClick={e => e.stopPropagation()}>
          {showPasscode && !isJoined ? (
            <div className="passcode-entry-inline">
              <input
                type="password"
                placeholder="Enter passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                disabled={isJoining}
                autoFocus
              />
              {error && <span className="error-message-small">{error}</span>}
              <button 
                type="button" 
                className="primary-button compact" 
                onClick={handleJoinClick}
                disabled={isJoining}
              >
                {isJoining ? "Joining..." : "Confirm"}
              </button>
            </div>
          ) : (
            <button 
              type="button" 
              className={isJoined ? "secondary-button" : "primary-button"} 
              onClick={handleJoinClick}
              disabled={isJoining || isJoined}
              aria-label={isJoined ? `Joined ${community.name}` : `Join ${community.name}`}
            >
              {isJoining ? "Joining..." : isJoined ? "✓ Joined" : "Join Community"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
