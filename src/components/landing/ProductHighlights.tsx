import CommunitiesCard from "./CommunitiesCard"
import RadioCard from "./RadioCard"
import ReportingCard from "./ReportingCard"

export default function ProductHighlights() {
  return (
    <section className="product-highlights">
      <ReportingCard />
      <RadioCard />
      <CommunitiesCard />
    </section>
  )
}
