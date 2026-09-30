import { Bell, Heart, ShieldCheck, UsersRound } from "lucide-react"
import { useState } from "react"
import { upcomingRooms } from "../../data/spaceData"
import type { SpaceDraft } from "../../types/spaces"

const icons = { shield: ShieldCheck, heart: Heart, users: UsersRound }

type UpcomingRoomsProps = {
  scheduledSpaces?: SpaceDraft[]
}

function scheduledTime(space: SpaceDraft) {
  if (!space.date || !space.time) return "Scheduled"
  return `${space.date} · ${space.time}`
}

export default function UpcomingRooms({ scheduledSpaces = [] }: UpcomingRoomsProps) {
  const [reminders, setReminders] = useState<string[]>([])

  function toggleReminder(id: string) {
    setReminders((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  return (
    <section className="side-card upcoming-card">
      <div className="side-card-heading">
        <h2>Upcoming Rooms</h2>
        <p>More conversations, more perspectives. All anonymous.</p>
      </div>

      <div className="upcoming-list">
        {scheduledSpaces.map((space, index) => {
          const id = `scheduled-${index}`
          const reminded = reminders.includes(id)
          return (
            <article className="upcoming-room" key={id}>
              <div className="upcoming-icon tone-orange"><UsersRound size={29} /></div>
              <div className="upcoming-copy">
                <h3>{space.title}</h3>
                <p>{scheduledTime(space)}</p>
                <div className="upcoming-tags"><span>{space.topic}</span></div>
              </div>
              <button className={reminded ? "reminded" : ""} type="button" onClick={() => toggleReminder(id)}>
                <Bell size={17} /> {reminded ? "Reminder set" : "Remind me"}
              </button>
            </article>
          )
        })}
        {upcomingRooms.map((room) => {
          const Icon = icons[room.icon]
          const reminded = reminders.includes(room.id)
          return (
            <article className="upcoming-room" key={room.id}>
              <div className={`upcoming-icon tone-${room.tone}`}><Icon size={29} /></div>
              <div className="upcoming-copy">
                <h3>{room.title}</h3>
                <p>{room.time}</p>
                <div className="upcoming-tags">
                  {room.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
              <button className={reminded ? "reminded" : ""} type="button" onClick={() => toggleReminder(room.id)}>
                <Bell size={17} /> {reminded ? "Reminder set" : "Remind me"}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
