import { Camera, Heart, ImageOff, Leaf, Plus, Share2, Users, UsersRound, Volume2, VolumeX, Zap, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { nip19 } from "nostr-tools";
import { API_URL, NOSTR_READ_RELAYS } from "../../features/post/config";
import type { FeedPost } from "../../features/post/feedEvent";
import PostSyncBadge from "../../features/offline/PostSyncBadge";
import type { Community } from "../../services/nostr/communityService";
import type { SensitiveReason } from "../../data/communityReports";
import PostZapModal from "./PostZapModal";
import SensitiveMedia from "./SensitiveMedia";
import "../../styles/postcard.css";

const icons = [Users, Heart, Camera, Leaf, UsersRound];

export function relativeTime(ts: number): string {
  const sec = Math.max(0, Date.now() / 1000 - ts);
  if (sec < 600) return "just now"; // created_at is rounded to 10 minutes; finer detail would be false
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 172800) return "yesterday";
  return new Date(ts * 1000).toLocaleDateString();
}

/** Real, shareable link: njump with the public relays as hints. */
export function postLink(post: Pick<FeedPost, "id" | "pubkey">): string {
  const relays = NOSTR_READ_RELAYS.filter((r) => r.startsWith("wss://"));
  return `https://njump.me/${nip19.neventEncode({ id: post.id, relays, author: post.pubkey })}`;
}

function usePhotoStatus(src: string | null): "loading" | "ok" | "error" {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  useEffect(() => {
    if (!src) return;
    setStatus("loading");
    const img = new Image();
    img.onload = () => setStatus("ok");
    img.onerror = () => setStatus("error");
    img.src = src;
    return () => { img.onload = null; img.onerror = null; };
  }, [src]);
  return status;
}

function PostPhoto({ src, sensitiveReason, alt }: { src: string; sensitiveReason: string | null; alt: string }) {
  const status = usePhotoStatus(src);
  if (status === "error") {
    return <div className="pc-photo-missing" role="img" aria-label="Photo unavailable"><ImageOff size={22} aria-hidden="true" /><span>Photo unavailable</span></div>;
  }
  if (status === "loading") return <div className="pc-photo-missing pc-photo-loading" aria-busy="true" />;
  return sensitiveReason ? (
    <SensitiveMedia src={src} alt={alt} reason={sensitiveReason as SensitiveReason} />
  ) : (
    <img className="report-image" src={src} alt={alt} loading="lazy" />
  );
}

type PostCardProps = {
  post: FeedPost;
  community: Community | null;
  communityIndex: number;
  /** Show the community name/icon and Join (all-posts view). */
  showCommunity: boolean;
  isJoined: boolean;
  onSelectCommunity: (id: string) => void;
  onJoin: (id: string) => void;
};

export default function PostCard({ post, community, communityIndex, showCommunity, isJoined, onSelectCommunity, onJoin }: PostCardProps) {
  const [zapOpen, setZapOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const Icon = icons[communityIndex % icons.length] ?? Users;

  useEffect(() => () => { if (speaking) window.speechSynthesis.cancel(); }, [speaking]);

  function toggleListen() {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(post.text);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(postLink(post));
      setShareNote("Link copied");
    } catch {
      setShareNote("Couldn't copy the link");
    }
    window.setTimeout(() => setShareNote(null), 2500);
  }

  // Real posts: built from the viewer's own API base, not the host stored in the event.
  const photoSrc = post.photoSrc ?? (post.photoSha256 ? `${API_URL}/media/${post.photoSha256}` : null);
  const time = relativeTime(post.createdAt);
  const hasCommunity = showCommunity && post.communityId && community;

  return (
    <article className={`report-card pc-card${photoSrc ? "" : " report-card--text-only"}${post.id === "demo-01" ? " pc-card--instagram" : ""}`}>
      {photoSrc && (
        <div className="report-image-wrap post-photo-wrap">
          <PostPhoto src={photoSrc} sensitiveReason={post.sensitiveReason} alt={post.photoAlt ?? "Photo attached to this post"} />
        </div>
      )}
      <div className="report-body">
        <div className="pc-header">
          <div className="pc-header-left">
            {hasCommunity ? (
              <>
                <button type="button" className="pc-community" onClick={() => onSelectCommunity(community.id)}>
                  <span className={`community-icon tone-${community.tone} pc-icon`}><Icon size={16} aria-hidden="true" /></span>
                  <strong>{community.name}</strong>
                </button>
                <span className="pc-time">· {time}</span>
              </>
            ) : (
              <>
                <strong>Pseudonymous</strong>
                <span className="pc-time">· {time}</span>
              </>
            )}
          </div>
          {hasCommunity && (isJoined
            ? <span className="pc-joined"><Check size={13} aria-hidden="true" /> Joined</span>
            : <button type="button" className="pc-join" onClick={() => onJoin(community.id)}>Join</button>)}
        </div>
        {hasCommunity && <p className="pc-author">Pseudonymous</p>}
        <PostSyncBadge entityId={post.id} />

        <p className="report-excerpt report-excerpt--formatted pc-text">{post.text}</p>

        <div className="report-footer pc-footer">
          <button type="button" className="zap-button" onClick={() => setZapOpen(true)}><Zap size={16} /> Zap</button>
          {canSpeak && (
            <button type="button" onClick={toggleListen} aria-pressed={speaking}>
              {speaking ? <VolumeX size={16} /> : <Volume2 size={16} />} {speaking ? "Stop" : "Listen"}
            </button>
          )}
          <button type="button" onClick={share} disabled={!post.onRelay} title={post.onRelay ? undefined : "Available once a relay has this post"}>
            <Share2 size={16} /> Share
          </button>
          {shareNote && <span className="pc-note" role="status">{shareNote}</span>}
        </div>
      </div>

      {zapOpen && <PostZapModal demo={post.isDemo} post={{ id: post.id, pubkey: post.pubkey, content: post.text, createdAt: post.createdAt }} onClose={() => setZapOpen(false)} />}
    </article>
  );
}

/** The "Post" button panel shown after the viewer has joined (see mockup). */
export function PostButtonPanel({ communityId }: { communityId: string }) {
  return (
    <div className="pc-post-panel">
      <a className="pc-post-button" href={`/post?community=${encodeURIComponent(communityId)}`}><Plus size={16} aria-hidden="true" /> Post</a>
      <span className="pc-post-hint">Opens the post page for this community</span>
    </div>
  );
}
