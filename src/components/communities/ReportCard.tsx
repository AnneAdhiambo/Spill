import {
  Bookmark,
  Heart,
  Languages,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Zap,
} from "lucide-react";
import type { ReportItem } from "../../data/communityReports";
import type { CommunityPost } from "../../services/nostr/communityService";
import MediaTrustBadge from "./MediaTrustBadge";
import SensitiveMedia from "./SensitiveMedia";

type ReportCardProps = {
  report: ReportItem | CommunityPost;
};

export default function ReportCard({ report }: ReportCardProps) {
  const isPost = 'pubkey' in report;
  
  const title = isPost ? "" : (report as ReportItem).title;
  const excerpt = isPost ? (report as CommunityPost).content : (report as ReportItem).excerpt;
  const hasMedia = !isPost && Boolean((report as ReportItem).imageUrl && (report as ReportItem).imageAlt);
  
  const timeAgo = isPost 
    ? new Date((report as CommunityPost).createdAt * 1000).toLocaleString() 
    : (report as ReportItem).timeAgo;
    
  const authorName = isPost 
    ? (report as CommunityPost).authorName || "Anonymous User"
    : "Identity hidden";
    
  const identityMode = isPost ? "PSEUDONYMOUS" : (report as ReportItem).identityMode;

  return (
    <article className={`report-card${hasMedia ? "" : " report-card--text-only"}`}>
      {hasMedia && (
        <div className="report-image-wrap">
          {(report as ReportItem).sensitiveReason ? (
            <SensitiveMedia
              src={(report as ReportItem).imageUrl!}
              alt={(report as ReportItem).imageAlt!}
              reason={(report as ReportItem).sensitiveReason!}
            />
          ) : (
            <img className="report-image" src={(report as ReportItem).imageUrl} alt={(report as ReportItem).imageAlt} />
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
            {!isPost && (report as ReportItem).mediaVerified ? <MediaTrustBadge /> : null}
            <button className="ghost-icon" type="button" aria-label="More options">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        {title && <h2>{title}</h2>}
        <p className="report-excerpt" style={{ whiteSpace: "pre-wrap" }}>{excerpt}</p>

        <div className="report-meta-actions">
          {!isPost && (report as ReportItem).translateLabel ? (
            <button className="text-link" type="button">
              <Languages size={17} />
              {(report as ReportItem).translateLabel}
            </button>
          ) : (
            <span />
          )}
        </div>

        <div className="report-footer">
          <button type="button">
            <Heart size={18} /> {report.likes || 0}
          </button>
          <button type="button">
            <MessageCircle size={18} /> {report.comments || 0}
          </button>
          {!isPost && (report as ReportItem).zaps ? (
            <button type="button" className="zap-button">
              <Zap size={16} /> Zap {(report as ReportItem).zaps} sats
            </button>
          ) : null}
          <button type="button">
            <Share2 size={18} /> Share
          </button>
          <button type="button">
            <Bookmark size={18} /> Save
          </button>
        </div>
      </div>
    </article>
  );
}
