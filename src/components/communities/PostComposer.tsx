import { useState } from "react";
import { communityService } from "../../services/nostr/communityService";

type PostComposerProps = {
  communityId: string;
  onPostPublished: () => void;
};

export default function PostComposer({ communityId, onPostPublished }: PostComposerProps) {
  const [content, setContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  
  const hasIdentity = communityService.hasIdentity();

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    if (!showPasscode) {
      setShowPasscode(true);
      return;
    }

    if (!passcode) {
      setError("Passcode is required to sign the event.");
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      await communityService.createPost(communityId, content, passcode);
      setContent("");
      setPasscode("");
      setShowPasscode(false);
      onPostPublished();
    } catch (err: any) {
      setError(err.message || "Failed to publish post. Please check your passcode and try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (!hasIdentity) {
    return (
      <div className="post-composer unauthenticated">
        <p>You must be signed in to post in this community.</p>
        <button className="primary-button" onClick={() => window.location.href = "/get-started"}>
          Get Started
        </button>
      </div>
    );
  }

  return (
    <form className="post-composer" onSubmit={handlePublish}>
      <textarea
        placeholder="What would you like to share with this community?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isPublishing}
        rows={4}
      />
      
      {showPasscode && (
        <div className="passcode-entry">
          <input
            type="password"
            placeholder="Enter your device passcode to sign"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            disabled={isPublishing}
            autoFocus
          />
        </div>
      )}

      {error && <p className="error-message">{error}</p>}
      
      <div className="composer-actions">
        <span className="character-count">
          {content.length > 0 ? `${content.length} chars` : ""}
        </span>
        <button 
          type="submit" 
          className="primary-button"
          disabled={!content.trim() || isPublishing}
        >
          {isPublishing ? "Publishing..." : showPasscode ? "Confirm & Publish" : "Publish"}
        </button>
      </div>
    </form>
  );
}
