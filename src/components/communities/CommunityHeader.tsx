import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import type { Community } from "../../services/nostr/communityService";
import { communityService } from "../../services/nostr/communityService";

type CommunityHeaderProps = {
  community: Community | null;
  loading: boolean;
  isJoined: boolean;
  onJoinSuccess: () => void;
  onBack: () => void;
};

export default function CommunityHeader({ community, loading, isJoined, onJoinSuccess, onBack }: CommunityHeaderProps) {
  const [isJoining, setIsJoining] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear passcode state when community changes
  useEffect(() => {
    setShowPasscode(false);
    setPasscode("");
    setError(null);
  }, [community?.id]);

  const handleJoin = async () => {
    if (isJoined) return;

    if (!communityService.hasIdentity()) {
      window.location.href = "/get-started";
      return;
    }

    if (!showPasscode) {
      setShowPasscode(true);
      return;
    }

    if (!passcode) {
      setError("Passcode is required to join.");
      return;
    }

    setIsJoining(true);
    setError(null);
    try {
      await communityService.joinCommunity(community!.id, passcode);
      setShowPasscode(false);
      setPasscode("");
      onJoinSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to join community");
    } finally {
      setIsJoining(false);
    }
  };

  if (loading) {
    return <header className="community-header"><h1>Loading community...</h1></header>;
  }

  if (!community) return null;

  return (
    <header className="community-header" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '16px 24px 20px' }}>
      <button 
        onClick={onBack} 
        style={{ 
          alignSelf: 'flex-start', 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px',
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          fontSize: '15px',
          fontWeight: 600,
          padding: 0,
          cursor: 'pointer'
        }}
      >
        <ArrowLeft size={16} /> Back to Communities
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginTop: '4px' }}>
        <div>
          <h1 style={{ marginBottom: '8px' }}>{community.name}</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '15px', lineHeight: 1.45, maxWidth: '500px' }}>{community.description}</p>
        </div>
        
        {showPasscode && !isJoined ? (
          <div className="passcode-entry-inline" style={{ alignItems: 'flex-end' }}>
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
              onClick={handleJoin}
              disabled={isJoining}
            >
              {isJoining ? "Joining..." : "Confirm Join"}
            </button>
          </div>
        ) : (
          <button 
            type="button" 
            className={isJoined ? "secondary-button" : "primary-button"} 
            onClick={handleJoin}
            disabled={isJoining || isJoined}
          >
            {isJoining ? "Joining..." : isJoined ? "✓ Joined" : "Join Community"}
          </button>
        )}
      </div>
    </header>
  );
}
