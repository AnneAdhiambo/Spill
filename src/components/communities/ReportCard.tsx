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
import MediaTrustBadge from "./MediaTrustBadge";
import SensitiveMedia from "./SensitiveMedia";

type ReportCardProps = {
  report: ReportItem;
};

function communityPill(community: ReportItem["community"]) {
  const labels: Record<ReportItem["community"], string> = {
    activism: "Activism",
    gbv: "GBV Support",
    journalism: "Independent Journalism",
    "human-rights": "Human Rights",
    climate: "Climate",
    youth: "Youth Voices",
  };

  return labels[community];
}

export default function ReportCard({ report }: ReportCardProps) {
  const hasMedia = Boolean(report.imageUrl && report.imageAlt);

  return (
    <article className={`report-card${hasMedia ? "" : " report-card--text-only"}`}>
      {hasMedia && (
        <div className="report-image-wrap">
          {report.sensitiveReason ? (
            <SensitiveMedia
              src={report.imageUrl!}
              alt={report.imageAlt!}
              reason={report.sensitiveReason}
            />
          ) : (
            <img className="report-image" src={report.imageUrl} alt={report.imageAlt} />
          )}
        </div>
      )}

      <div className="report-body">
        <div className="report-header-row">
          <div className="author-block">
            <div className="avatar avatar--private" aria-hidden="true" />
            <div>
              <div className="author-line">
                <strong>Identity hidden</strong>
                <span className="identity-chip">{report.identityMode}</span>
              </div>
              <p>{report.timeAgo} · Name and location protected</p>
            </div>
          </div>

          <div className="report-header-actions">
            {report.mediaVerified ? <MediaTrustBadge /> : null}
            <button className="ghost-icon" type="button" aria-label="More options">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        <span className={`topic-chip topic-${report.community}`}>
          {communityPill(report.community)}
        </span>

        <h2>{report.title}</h2>
        <p className="report-excerpt">{report.excerpt}</p>

        <div className="report-meta-actions">
          {report.translateLabel ? (
            <button className="text-link" type="button">
              <Languages size={17} />
              {report.translateLabel}
            </button>
          ) : (
            <span />
          )}
        </div>

        <div className="report-footer">
          <button type="button">
            <Heart size={18} /> {report.likes}
          </button>
          <button type="button">
            <MessageCircle size={18} /> {report.comments}
          </button>
          {report.zaps ? (
            <button type="button" className="zap-button">
              <Zap size={16} /> Zap {report.zaps} sats
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
