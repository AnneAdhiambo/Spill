import { ImageOff, MapPin } from "lucide-react"
import TopNavbar from "../components/communities/TopNavbar"
import { useSpillPosts, type SpillPost } from "../features/post/useSpillPosts"
import "../styles/communities.css"
import "../styles/post.css"

function relativeTime(ts: number): string {
  const sec = Math.max(0, Date.now() / 1000 - ts)
  if (sec < 600) return "just now" // created_at is rounded to 10 minutes, so finer detail would be false
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 172800) return "yesterday"
  return new Date(ts * 1000).toLocaleDateString()
}

// Only photos served from our own media store (/media/<sha256>, hash matches) are known to be cleaned.
const isOurCleanedPhoto = (p: NonNullable<SpillPost["photo"]>) => p.url.endsWith(`/media/${p.sha256}`)

// Reuses the existing feed card design (report-card classes from communities.css).
function PostCard({ post }: { post: SpillPost }) {
  return (
    <article className={`report-card${post.photo ? "" : " report-card--text-only"}`}>
      {post.photo && (
        <div className="report-image-wrap post-photo-wrap">
          <img className="report-image" src={post.photo.url} alt="Photo attached to this post" loading="lazy" />
          {isOurCleanedPhoto(post.photo) && <span className="post-chip"><ImageOff size={13} aria-hidden="true" /> Metadata removed</span>}
        </div>
      )}
      <div className="report-body">
        <div className="report-header-row">
          <div className="author-block">
            <div className="avatar avatar--private" aria-hidden="true" />
            <div>
              <div className="author-line"><strong>Anonymous</strong></div>
              <p>{relativeTime(post.createdAt)}{post.area && <> · <MapPin size={12} aria-hidden="true" /> {post.area}</>}</p>
            </div>
          </div>
        </div>
        <p className="report-excerpt" style={{ whiteSpace: "pre-wrap" }}>{post.text}</p>
      </div>
    </article>
  )
}

export default function FeedPage() {
  const { posts, state } = useSpillPosts()
  return (
    <div className="communities-page page-shell">
      <TopNavbar />
      <main className="post-page post-feed">
        <h1>Feed</h1>
        {state === "loading" && <p className="post-muted">Connecting to relays…</p>}
        {state === "error" && posts.length === 0 && <p className="post-error" role="alert">Couldn’t reach any relay, so no posts can be shown right now.</p>}
        {state === "ready" && posts.length === 0 && <p className="post-muted">No posts yet.</p>}
        <section className="feed-list" aria-label="Posts" aria-live="polite">
          {posts.map((p) => <PostCard key={p.id} post={p} />)}
        </section>
      </main>
    </div>
  )
}
