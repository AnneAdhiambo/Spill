import { useMemo, useState } from "react"
import CommunityHeader from "../components/communities/CommunityHeader"
import CommunitySidebar from "../components/communities/CommunitySidebar"
import CommunityTabs from "../components/communities/CommunityTabs"
import CommunityFeed from "../components/communities/CommunityFeed"
import TopNavbar from "../components/communities/TopNavbar"
import { communityTabs, reports, type CommunityKey } from "../data/communityReports"
import "../styles/communities.css"

export default function CommunitiesPage() {
  const [selected, setSelected] = useState<CommunityKey>("all")

  const filteredReports = useMemo(() => {
    if (selected === "all") return reports
    return reports.filter((report) => report.community === selected)
  }, [selected])

  return (
    <div className="communities-page page-shell">
      <TopNavbar />
      <main className="communities-layout">
        <section className="main-column">
          <CommunityHeader />
          <CommunityTabs tabs={communityTabs} selected={selected} onSelect={setSelected} />
          <CommunityFeed reports={filteredReports} />
        </section>
        <CommunitySidebar />
      </main>
    </div>
  )
}
