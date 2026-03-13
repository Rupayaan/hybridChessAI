export type GameMode = "bot" | "local" | "online";

export type TimeControl = {
  id: string;
  label: string;
  minutes: number;
  increment: number;
};

export type GameState = "dashboard" | "timer-selection" | "playing";

export type RoomData = {
  roomId: string;
  roomCode: string;
  color: string;  // "white" or "black"
};

// ...existing TIME_CONTROLS...
export const TIME_CONTROLS: TimeControl[] = [
  { id: "bullet-1", label: "1 minute", minutes: 1, increment: 0 },
  { id: "bullet-2-1", label: "2 + 1", minutes: 2, increment: 1 },
  { id: "blitz-3", label: "3 minutes", minutes: 3, increment: 0 },
  { id: "blitz-3-2", label: "3 + 2", minutes: 3, increment: 2 },
  { id: "blitz-5", label: "5 minutes", minutes: 5, increment: 0 },
  { id: "blitz-5-3", label: "5 + 3", minutes: 5, increment: 3 },
  { id: "blitz-10", label: "10 minutes", minutes: 10, increment: 0 },
  { id: "rapid-15-10", label: "15 + 10", minutes: 15, increment: 10 },
  { id: "rapid-25-10", label: "25 + 10", minutes: 25, increment: 10 },
  { id: "classical-30-0", label: "30 minutes", minutes: 30, increment: 0 },
];