export type SpaceDraft = {
  title: string;
  prompt: string;
  topic: string;
  startMode: "now" | "schedule";
  date?: string;
  time?: string;
};
