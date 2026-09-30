import CommunityHeader from "../components/communities/CommunityHeader"
import CommunitySidebar from "../components/communities/CommunitySidebar"
import CommunityFeed from "../components/communities/CommunityFeed"
import TopNavbar from "../components/communities/TopNavbar"
import { reports } from "../data/communityReports"
import "../styles/communities.css"

export default function CommunitiesPage() {
  return (
    <div className="communities-page page-shell">
      <TopNavbar />
      <main className="communities-layout">
        <section className="main-column">
          <CommunityHeader />
          <CommunityFeed reports={reports} />
        </section>
        <CommunitySidebar />
      </main>
    </div>
  )
}
