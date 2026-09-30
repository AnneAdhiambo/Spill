import { MessageCircle, MoreHorizontal, Send } from "lucide-react"
import { chatMessages } from "../../data/spaceData"

export default function AnonymousChat() {
  return (
    <section className="side-card chat-card">
      <div className="chat-heading">
        <h2><MessageCircle size={20} /> Live Chat (anonymous)</h2>
        <button className="icon-ghost" type="button" aria-label="More chat options"><MoreHorizontal size={20} /></button>
      </div>

      <div className="chat-messages">
        {chatMessages.map((item) => (
          <div className="chat-message" key={item.id}>
            <span className={`chat-badge tone-${item.tone}`}>{item.badge}</span>
            <div>
              <p className="chat-meta"><strong>{item.name}</strong> <span>· {item.time}</span></p>
              <p>{item.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input-wrap">
        <input aria-label="Anonymous message" placeholder="Join the conversation anonymously..." />
        <button type="button" aria-label="Send message"><Send size={20} /></button>
      </div>
    </section>
  )
}
