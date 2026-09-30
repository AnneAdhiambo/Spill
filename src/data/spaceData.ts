export type UpcomingRoom = {
  id: string;
  title: string;
  time: string;
  tags: string[];
  icon: "shield" | "heart" | "users";
  tone: "purple" | "red" | "orange";
};

export type ChatMessage = {
  id: string;
  badge: "A";
  name: "Anonymous";
  time: string;
  message: string;
  tone: "red" | "blue" | "green" | "orange";
};

export const upcomingRooms: UpcomingRoom[] = [
  {
    id: "journalist-safety",
    title: "Digital Safety for Journalists",
    time: "Today · 4:00 PM EAT",
    tags: ["Safety", "Journalism"],
    icon: "shield",
    tone: "purple",
  },
  {
    id: "gbv-support",
    title: "GBV Support Circle",
    time: "Today · 7:00 PM EAT",
    tags: ["GBV Support", "Community"],
    icon: "heart",
    tone: "red",
  },
  {
    id: "youth-checkin",
    title: "Youth Voices Check-in",
    time: "Tomorrow · 3:00 PM EAT",
    tags: ["Youth Voices", "Mental Health"],
    icon: "users",
    tone: "orange",
  },
];

export const chatMessages: ChatMessage[] = [
  {
    id: "1",
    badge: "A",
    name: "Anonymous",
    time: "2m ago",
    message: "Incredible to hear these on-the-ground perspectives.",
    tone: "red",
  },
  {
    id: "2",
    badge: "A",
    name: "Anonymous",
    time: "3m ago",
    message: "This shows the power of young people.",
    tone: "blue",
  },
  {
    id: "3",
    badge: "A",
    name: "Anonymous",
    time: "4m ago",
    message: "We need more community support like this.",
    tone: "green",
  },
  {
    id: "4",
    badge: "A",
    name: "Anonymous",
    time: "6m ago",
    message: "Solidarity to everyone out there.",
    tone: "orange",
  },
];
