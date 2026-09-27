import { Camera, Heart, Leaf, Users, UsersRound } from "lucide-react"
import { communities } from "../../data/communityReports"

const icons = [Users, Heart, Camera, Leaf, UsersRound]

export default function CommunitySidebar() {
  return (
    <aside className="community-sidebar">
      <section className="sidebar-card">
        <h2>Communities</h2>
        <p>
          Join topic-based communities to connect, share experiences, get support and collaborate on solutions.
        </p>

        <div className="community-list">
          {communities.map((community, index) => {
            const Icon = icons[index] ?? Users
            return (
              <div className="community-list-item" key={community.name}>
                <div className="community-icon-wrap">
                  <span className={`community-icon tone-${community.tone}`}>
                    <Icon size={22} />
                  </span>
                  <div>
                    <h3>{community.name}</h3>
                    <strong>{community.members}</strong>
                    <p>{community.description}</p>
                  </div>
                </div>
                <button type="button">Join</button>
              </div>
            )
          })}
        </div>
      </section>

      <section className="promo-card">
        <img src="/assets/promo-card.png" alt="Stronger communities. A more inclusive Africa." />
      </section>
    </aside>
  )
}
