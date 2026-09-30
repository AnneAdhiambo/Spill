import { Camera, Heart, Leaf, Users, UsersRound } from "lucide-react"
import type { Community } from "../../services/nostr/communityService"

const icons = [Users, Heart, Camera, Leaf, UsersRound]

type CommunitySidebarProps = {
  communities: Community[];
  activeCommunityId: string | null;
  onSelectCommunity: (id: string) => void;
};

export default function CommunitySidebar({ communities, activeCommunityId, onSelectCommunity }: CommunitySidebarProps) {
  return (
    <aside className="community-sidebar">
      <section className="sidebar-card">
        <h2>Communities</h2>
        <p>
          Join topic-based communities to connect, share experiences, get support and collaborate on solutions.
        </p>

        <div className="community-list">
          {communities.map((community, index) => {
            const Icon = icons[index % icons.length] ?? Users;
            const isActive = community.id === activeCommunityId;
            return (
              <div 
                className={`community-list-item ${isActive ? "active" : ""}`} 
                key={community.id}
                onClick={() => onSelectCommunity(community.id)}
                style={{ cursor: "pointer", backgroundColor: isActive ? "var(--bg-elevated)" : undefined }}
              >
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
