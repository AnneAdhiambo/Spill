import { Camera, Heart, Leaf, Newspaper, Scale, Users, UsersRound } from "lucide-react"
import type { CommunityKey } from "../../data/communityReports"

const iconMap: Record<CommunityKey, typeof Camera> = {
  all: Camera,
  activism: Users,
  gbv: Heart,
  journalism: Newspaper,
  "human-rights": Scale,
  climate: Leaf,
  youth: UsersRound,
}

type Tab = { key: CommunityKey; label: string }

type Props = {
  tabs: Tab[]
  selected: CommunityKey
  onSelect: (value: CommunityKey) => void
}

export default function CommunityTabs({ tabs, selected, onSelect }: Props) {
  return (
    <div className="community-tabs" role="tablist" aria-label="Community filters">
      {tabs.map((tab) => {
        const Icon = iconMap[tab.key]
        const active = tab.key === selected
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "active" : ""}
            onClick={() => onSelect(tab.key)}
          >
            <Icon size={17} />
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
