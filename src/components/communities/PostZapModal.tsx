import type { CommunityPost } from "../../services/nostr/communityService";
import ZapModal from "../zaps/ZapModal";

/**
 * The one place our cards open ZapModal. Props are copied from ReportCard's
 * post branch (initialSats, targetLabel, recipientNostrPubkey, targetEventId).
 * zapParity.test.tsx fails if they ever differ.
 */
export default function PostZapModal({ post, demo = false, onClose }: { post: CommunityPost; demo?: boolean; onClose: () => void }) {
  // Demo posts have no real event or author: same props ReportCard gives a static report.
  if (demo) {
    return <ZapModal initialSats={21} targetLabel="Anonymous Reporter" onClose={onClose} />;
  }
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
