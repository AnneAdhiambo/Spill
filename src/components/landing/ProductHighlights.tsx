import CommunitiesCard from "./CommunitiesCard"
import SpaceCard from "./SpaceCard"
import ReportingCard from "./ReportingCard"

export default function ProductHighlights() {
  return (
    <section className="product-highlights">
      <ReportingCard />
      <SpaceCard />
      <CommunitiesCard />
    </section>
  )
}
