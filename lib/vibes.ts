// Vibes: a one-tap "what I'm up for" that colours your light and tells a
// stranger what kind of conversation to expect — without any profile.
export interface Vibe {
  id: string;
  emoji: string;
  label: string;
  color: string;
}

export const VIBES: Vibe[] = [
  { id: "chill", emoji: "☕", label: "Just chilling", color: "#ffb238" },
  { id: "music", emoji: "🎧", label: "Music talk", color: "#b892ff" },
  { id: "deep", emoji: "🌙", label: "Deep talk", color: "#7fb2ff" },
  { id: "laugh", emoji: "😂", label: "Make me laugh", color: "#ff8fb1" },
  { id: "lang", emoji: "🗣️", label: "Practice a language", color: "#8ee07a" },
];

export const DEFAULT_VIBE = "chill";

export function vibeById(id: string | null | undefined): Vibe {
  return VIBES.find((v) => v.id === id) ?? VIBES[0];
}

export function isVibeId(v: unknown): v is string {
  return typeof v === "string" && VIBES.some((x) => x.id === v);
}

// Picks a spark index not used yet in this conversation.
export function pickSpark(used: Set<number>): number {
  if (used.size >= SPARKS.length) used.clear();
  let i = Math.floor(Math.random() * SPARKS.length);
  while (used.has(i)) i = (i + 1) % SPARKS.length;
  used.add(i);
  return i;
}

// Spark prompts: one tap drops a shared opener into both chats.
export const SPARKS: string[] = [
  "What does the sky look like where you are right now?",
  "What's a small thing that made your day better recently?",
  "If you could teleport anywhere for one hour, where would you go?",
  "What song have you had on repeat lately?",
  "What's something your city does better than anywhere else?",
  "What's a food from where you live that everyone should try?",
  "What are you looking forward to this week?",
  "What's the best piece of advice a stranger ever gave you?",
  "Morning person or night owl? What time is it for you now?",
  "What's a word in your language that has no good translation?",
  "What's a hobby you'd pick up if time and money didn't matter?",
  "What's the most beautiful place you've ever been?",
];
