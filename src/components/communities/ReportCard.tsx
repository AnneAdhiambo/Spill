import {
  Bookmark,
  Heart,
  Languages,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type { ReportItem } from "../../data/communityReports";
import type { CommunityPost } from "../../services/nostr/communityService";
import ZapModal from "../zaps/ZapModal";
import MediaTrustBadge from "./MediaTrustBadge";
import SensitiveMedia from "./SensitiveMedia";

type ReportCardProps = {
  report: ReportItem | CommunityPost;
};

export default function ReportCard({ report }: ReportCardProps) {
  const [isZapModalOpen, setIsZapModalOpen] = useState(false);
  const isPost = "pubkey" in report;
  const staticReport = isPost ? null : report;
  const title = staticReport?.title ?? "";
  const excerpt = isPost ? report.content : staticReport?.excerpt ?? "";
  const imageUrl = isPost ? report.imageUrl : staticReport?.imageUrl;
  const imageAlt = isPost ? report.imageAlt : staticReport?.imageAlt;
  const sensitiveReason = isPost ? report.sensitiveReason : staticReport?.sensitiveReason;
  const hasMedia = Boolean(imageUrl && imageAlt);
  const timeAgo = isPost
    ? new Date(report.createdAt * 1000).toLocaleString()
    : staticReport?.timeAgo ?? "";
  const authorName = isPost ? report.authorName || "Anonymous User" : "Identity hidden";
  const identityMode = isPost
    ? "PSEUDONYMOUS"
    : staticReport?.identityMode ?? "ANONYMOUS";

  return (
    <article className={`report-card${hasMedia ? "" : " report-card--text-only"}`}>
      {hasMedia && staticReport && (
        <div className="report-image-wrap">
          {sensitiveReason ? (
            <SensitiveMedia
              src={imageUrl!}
              alt={imageAlt!}
              reason={sensitiveReason}
            />
          ) : (
            <img className="report-image" src={imageUrl} alt={imageAlt} />
          )}
        </div>
      )}

      <div className="report-body">
        <div className="report-header-row">
          <div className="author-block">
            <div className="avatar avatar--private" aria-hidden="true" />
            <div>
              <div className="author-line">
                <strong>{authorName}</strong>
                <span className="identity-chip">{identityMode}</span>
              </div>
              <p>{timeAgo} · Name and location protected</p>
            </div>
          </div>

          <div className="report-header-actions">
            {staticReport?.mediaVerified ? <MediaTrustBadge /> : null}
            <button className="ghost-icon" type="button" aria-label="More options"><MoreHorizontal size={18} /></button>
          </div>
        </div>

        {title && <h2>{title}</h2>}
        <p className={`report-excerpt${isPost ? " report-excerpt--formatted" : ""}`}>{excerpt}</p>

        <div className="report-meta-actions">
          {staticReport?.translateLabel ? (
            <button className="text-link" type="button"><Languages size={17} />{staticReport.translateLabel}</button>
          ) : <span />}
        </div>

        <div className="report-footer">
          <button type="button"><Heart size={18} /> {report.likes || 0}</button>
          <button type="button"><MessageCircle size={18} /> {report.comments || 0}</button>
          <button type="button" className="zap-button" onClick={() => setIsZapModalOpen(true)}>
            <Zap size={16} /> {staticReport?.zaps ? `Zap ${staticReport.zaps} sats` : "Zap"}
          </button>
          <button type="button"><Share2 size={18} /> Share</button>
          <button type="button"><Bookmark size={18} /> Save</button>
        </div>
      </div>

      {isZapModalOpen && (
        <ZapModal initialSats={staticReport?.zaps ?? 21} targetLabel="Anonymous Reporter" onClose={() => setIsZapModalOpen(false)} />
      )}
    </article>
  );
}
