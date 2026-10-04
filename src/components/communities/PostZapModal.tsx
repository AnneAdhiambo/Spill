import type { CommunityPost } from "../../services/nostr/communityService";
import ZapModal from "../zaps/ZapModal";

/**
 * The one place our cards open ZapModal. Props are copied from ReportCard's
 * post branch (initialSats, targetLabel, recipientNostrPubkey, targetEventId).
 * zapParity.test.tsx fails if they ever differ.
 */
export default function PostZapModal({ post, onClose }: { post: CommunityPost; onClose: () => void }) {
  return (
    <ZapModal
      initialSats={21}
      targetLabel={post.authorName || "Community Member"}
      recipientNostrPubkey={post.pubkey}
      targetEventId={post.id}
      onClose={onClose}
    />
  );
}
