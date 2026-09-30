import type { ReportItem } from "../../data/communityReports";
import ReportCard from "./ReportCard";

type CommunityFeedProps = {
  reports: ReportItem[];
};

export default function CommunityFeed({ reports }: CommunityFeedProps) {
  if (reports.length === 0) {
    return <p className="empty-feed">No reports have been shared in this community yet.</p>;
  }

  return (
    <section className="feed-list" aria-label="Community reports" aria-live="polite">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </section>
  );
}
