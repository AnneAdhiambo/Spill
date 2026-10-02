import { useState } from "react"
import SpillNavbar from "../components/layout/SpillNavbar"
import AnonymousChat from "../components/space/AnonymousChat"
import CreateSpacePanel from "../components/space/CreateSpacePanel"
import LiveAudioConnection from "../components/space/LiveAudioConnection"
import LiveRoomCard from "../components/space/LiveRoomCard"
import NewSpaceCard from "../components/space/NewSpaceCard"
import SpaceHeader from "../components/space/SpaceHeader"
import UpcomingRooms from "../components/space/UpcomingRooms"
import { requestLiveKitToken, type LiveKitRole, type LiveKitSession } from "../services/livekit/tokenClient"
import type { SpaceDraft } from "../types/spaces"
import "../styles/space.css"

export default function SpacePage() {
  const [activeTab, setActiveTab] = useState<"live" | "upcoming" | "recordings">("live")
  const [isCreatingSpace, setIsCreatingSpace] = useState(false)
  const [newLiveSpace, setNewLiveSpace] = useState<SpaceDraft | null>(null)
  const [scheduledSpaces, setScheduledSpaces] = useState<SpaceDraft[]>([])
  const [liveKitSession, setLiveKitSession] = useState<LiveKitSession | null>(null)
  const [isJoiningAudio, setIsJoiningAudio] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)

  async function joinAudio(roomName: string, role: LiveKitRole) {
    setAudioError(null)
    setIsJoiningAudio(true)

    try {
      setLiveKitSession(await requestLiveKitToken(roomName, role))
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Unable to join this Space.")
    } finally {
      setIsJoiningAudio(false)
    }
  }

  function changeTab(tab: "live" | "upcoming" | "recordings") {
    setActiveTab(tab)
    if (tab !== "live") setLiveKitSession(null)
  }

  async function createSpace(space: SpaceDraft) {
    setIsCreatingSpace(false)

    if (space.startMode === "schedule") {
      setScheduledSpaces((spaces) => [space, ...spaces])
      changeTab("upcoming")
      return
    }

    setNewLiveSpace(space)
    changeTab("live")
    await joinAudio(toRoomName(space.title), "host")
  }

  return (
    <div className="space-page">
      <SpillNavbar activeLink="Space" />

      <main className={`space-layout${activeTab !== "live" || isCreatingSpace ? " single-column" : ""}`}>
        <section className="space-main-column">
          <SpaceHeader
            activeTab={activeTab}
            onTabChange={changeTab}
            onCreateSpace={() => {
              setNewLiveSpace(null)
              setLiveKitSession(null)
              setAudioError(null)
              setIsCreatingSpace(true)
            }}
          />

          {liveKitSession && activeTab === "live" && !isCreatingSpace && (
            <LiveAudioConnection
              session={liveKitSession}
              onError={setAudioError}
              onDisconnected={() => setLiveKitSession(null)}
            />
          )}

          {audioError && <p className="live-audio-error" role="alert">{audioError}</p>}

          {isCreatingSpace ? (
            <CreateSpacePanel onClose={() => setIsCreatingSpace(false)} onCreate={createSpace} />
          ) : activeTab === "live" ? (
            <>
              {newLiveSpace ? (
                <NewSpaceCard space={newLiveSpace} />
              ) : (
                <LiveRoomCard
                  isJoining={isJoiningAudio}
                  isHosting={liveKitSession?.role === "host"}
                  onHost={() => joinAudio("activism-civic-rights", "host")}
                />
              )}
            </>
          ) : activeTab === "upcoming" ? (
            <div className="mobile-inline-panel">
              <UpcomingRooms scheduledSpaces={scheduledSpaces} />
            </div>
          ) : (
            <div className="recordings-empty">
              <span>RECORDINGS</span>
              <h2>Nothing saved yet.</h2>
              <p>Recorded public rooms will appear here when replay is enabled.</p>
            </div>
          )}
        </section>

        {activeTab === "live" && !isCreatingSpace && (
          <aside className="space-sidebar">
            <UpcomingRooms scheduledSpaces={scheduledSpaces} />
            <AnonymousChat />
          </aside>
        )}
      </main>
    </div>
  )
}

function toRoomName(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)

  return normalized.length >= 3 ? normalized : `spill-space-${Date.now()}`
}
