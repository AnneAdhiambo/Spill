import { ImagePlus, X } from "lucide-react";
import { useState } from "react";
import { communityService } from "../../services/nostr/communityService";
import type { SensitiveReason } from "../../data/communityReports";

type PostComposerProps = {
  communityId: string;
  onPostPublished: () => void;
};

export default function PostComposer({ communityId, onPostPublished }: PostComposerProps) {
  const [content, setContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [attachment, setAttachment] = useState<{ imageUrl: string; imageAlt: string } | null>(null);
  const [isSensitive, setIsSensitive] = useState(false);
  const [sensitiveReason, setSensitiveReason] = useState<SensitiveReason>("violence");
  
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
    setNotice(null);

    try {
      const { synced } = await communityService.createPost(
        communityId,
        content,
        passcode,
        attachment ? { ...attachment, ...(isSensitive ? { sensitiveReason } : {}) } : undefined,
      );
      setContent("");
      setPasscode("");
      setShowPasscode(false);
      setAttachment(null);
      setIsSensitive(false);
      setNotice(synced ? "Posted." : "Post saved on this device. It will sync when you're back online.");
      onPostPublished();
    } catch (err: any) {
      setError(err.message || "Failed to publish post. Please check your passcode and try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file to attach it to your post.");
      return;
    }

    if (file.size > 1_500_000) {
      setError("Choose an image smaller than 1.5 MB for now.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachment({ imageUrl: reader.result, imageAlt: file.name || "Attached community image" });
        setError(null);
      }
    };
    reader.onerror = () => setError("The image could not be read. Please try another file.");
    reader.readAsDataURL(file);
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

      <div className="composer-media-row">
        <label className="composer-attach-button">
          <ImagePlus size={17} />
          <span>{attachment ? "Replace image" : "Add image"}</span>
          <input type="file" accept="image/*" onChange={handleImageChange} disabled={isPublishing} />
        </label>
        <span className="composer-media-hint">PNG, JPG, or WebP up to 1.5 MB</span>
      </div>

      {attachment && (
        <div className="composer-image-preview">
          <img src={attachment.imageUrl} alt="Selected image preview" />
          <button type="button" className="composer-remove-image" onClick={() => setAttachment(null)} aria-label="Remove attached image">
            <X size={16} />
          </button>
          <label className="composer-sensitive-toggle">
            <input type="checkbox" checked={isSensitive} onChange={(event) => setIsSensitive(event.target.checked)} />
            Sensitive image
          </label>
          {isSensitive && (
            <select value={sensitiveReason} onChange={(event) => setSensitiveReason(event.target.value as SensitiveReason)}>
              <option value="violence">Violence</option>
              <option value="death">Death</option>
              <option value="gender-based violence">GBV</option>
            </select>
          )}
        </div>
      )}
      
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
      {notice && <p className="composer-notice" role="status">{notice}</p>}
      
      <div className="composer-actions">
        <span className="character-count">
          {content.length > 0 ? `${content.length} chars` : ""}
        </span>
        <button 
          type="submit" 
          className="primary-button"
          disabled={!content.trim() || isPublishing}
        >
          {isPublishing ? "Saving..." : showPasscode ? "Confirm & Publish" : "Publish"}
        </button>
      </div>
    </form>
  );
}
