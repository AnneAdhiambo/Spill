import { CalendarDays, PlayCircle, Plus, Radio } from "lucide-react";

type Props = {
  activeTab: "live" | "upcoming" | "recordings";
  onTabChange: (value: "live" | "upcoming" | "recordings") => void;
  onCreateSpace: () => void;
};

export default function SpaceHeader({ activeTab, onTabChange, onCreateSpace }: Props) {
  return (
    <section className="space-header">
      <p className="section-eyebrow">SPACE</p>
      <h1>
        <span className="space-title-brand">Spill</span>
        <span className="space-title-name">Space</span>
      </h1>

      <div className="space-header-controls">
        <div className="space-tabs" role="tablist" aria-label="Spill Space views">
          <button className={activeTab === "live" ? "active" : ""} onClick={() => onTabChange("live")} type="button">
            <Radio size={19} /> Live Now
          </button>
          <button className={activeTab === "upcoming" ? "active" : ""} onClick={() => onTabChange("upcoming")} type="button">
            <CalendarDays size={19} /> Upcoming
          </button>
          <button className={activeTab === "recordings" ? "active" : ""} onClick={() => onTabChange("recordings")} type="button">
            <PlayCircle size={19} /> Recordings
          </button>
        </div>
        <button className="create-space-button" type="button" onClick={onCreateSpace}>
          <Plus size={18} /> Create Space
        </button>
      </div>
    </section>
  );
}
