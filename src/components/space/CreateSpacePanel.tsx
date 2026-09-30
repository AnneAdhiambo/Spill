import { CalendarDays, MessageCircle, ShieldCheck, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { SpaceDraft } from "../../types/spaces";

type CreateSpacePanelProps = {
  onClose: () => void;
  onCreate: (draft: SpaceDraft) => void;
};

export default function CreateSpacePanel({ onClose, onCreate }: CreateSpacePanelProps) {
  const [startMode, setStartMode] = useState<SpaceDraft["startMode"]>("now");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    onCreate({
      title: String(form.get("title")),
      prompt: String(form.get("prompt")),
      topic: String(form.get("topic")),
      startMode,
      date: startMode === "schedule" ? String(form.get("date")) : undefined,
      time: startMode === "schedule" ? String(form.get("time")) : undefined,
    });
  }

  return (
    <section className="create-space-panel" aria-labelledby="create-space-title">
      <div className="create-space-heading">
        <div>
          <span className="section-eyebrow">NEW SPACE</span>
          <h2 id="create-space-title">Create a Space</h2>
          <p>Start an anonymous conversation around an issue that matters.</p>
        </div>
        <button className="close-space-button" type="button" onClick={onClose} aria-label="Close Create Space form">
          <X size={19} />
        </button>
      </div>

      <form className="create-space-form" onSubmit={handleSubmit}>
        <label>
          Space title
          <input name="title" placeholder="What should people talk about?" required />
        </label>

        <label>
          Discussion prompt
          <textarea name="prompt" rows={2} placeholder="Give people a safe starting point for the conversation." required />
        </label>

        <div className="create-space-row">
          <label>
            Topic
            <select name="topic" defaultValue="Activism">
              <option value="Activism">Activism</option>
              <option value="GBV Support">GBV Support</option>
              <option value="Independent Journalism">Independent Journalism</option>
              <option value="Human Rights">Human Rights</option>
              <option value="Climate">Climate</option>
              <option value="Youth Voices">Youth Voices</option>
            </select>
          </label>

          <fieldset>
            <legend>When should it begin?</legend>
            <label><input type="radio" name="start" checked={startMode === "now"} onChange={() => setStartMode("now")} /> Start now</label>
            <label><input type="radio" name="start" checked={startMode === "schedule"} onChange={() => setStartMode("schedule")} /> Schedule</label>
          </fieldset>
        </div>

        {startMode === "schedule" && (
          <div className="schedule-fields">
            <label>Start date<input type="date" name="date" required /></label>
            <label>Start time<input type="time" name="time" required /></label>
          </div>
        )}

        <div className="space-safety-options">
          <label><input type="checkbox" defaultChecked /> <ShieldCheck size={16} /> Protected identities</label>
          <label><input type="checkbox" defaultChecked /> <MessageCircle size={16} /> Anonymous chat</label>
          <label><input type="checkbox" /> <CalendarDays size={16} /> Host approval to speak</label>
        </div>

        <div className="create-space-actions">
          <button className="create-space-submit" type="submit">
            {startMode === "schedule" ? "Schedule Space" : "Start Space"}
          </button>
          <button className="create-space-cancel" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
