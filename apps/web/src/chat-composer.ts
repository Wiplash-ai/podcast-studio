export interface ChatEmoji {
  emoji: string;
  name: string;
  keywords: string[];
}

export interface ChatEmojiToken {
  end: number;
  query: string;
  start: number;
}

export const chatEmojis: ChatEmoji[] = [
  { emoji: "😀", name: "grinning", keywords: ["happy", "smile"] },
  { emoji: "😂", name: "joy", keywords: ["laugh", "tears"] },
  { emoji: "🤣", name: "rofl", keywords: ["laugh", "rolling"] },
  { emoji: "😊", name: "blush", keywords: ["happy", "smile"] },
  { emoji: "😍", name: "heart_eyes", keywords: ["love", "crush"] },
  { emoji: "🥰", name: "smiling_hearts", keywords: ["love", "affection"] },
  { emoji: "😎", name: "sunglasses", keywords: ["cool"] },
  { emoji: "🤔", name: "thinking", keywords: ["hmm", "question"] },
  { emoji: "🫡", name: "saluting", keywords: ["respect", "yes"] },
  { emoji: "😭", name: "sob", keywords: ["cry", "sad"] },
  { emoji: "😅", name: "sweat_smile", keywords: ["relief", "nervous"] },
  { emoji: "😬", name: "grimacing", keywords: ["awkward", "yikes"] },
  { emoji: "🤯", name: "mind_blown", keywords: ["shocked", "wow"] },
  { emoji: "🥳", name: "partying", keywords: ["celebrate", "party"] },
  { emoji: "🤩", name: "star_struck", keywords: ["wow", "excited"] },
  { emoji: "😴", name: "sleeping", keywords: ["tired"] },
  { emoji: "👋", name: "wave", keywords: ["hello", "goodbye"] },
  { emoji: "👍", name: "thumbs_up", keywords: ["yes", "approve", "+1"] },
  { emoji: "👎", name: "thumbs_down", keywords: ["no", "disapprove", "-1"] },
  { emoji: "👏", name: "clap", keywords: ["applause", "bravo"] },
  { emoji: "🙌", name: "raised_hands", keywords: ["hooray", "celebrate"] },
  { emoji: "🤝", name: "handshake", keywords: ["deal", "agreement"] },
  { emoji: "🙏", name: "pray", keywords: ["please", "thanks"] },
  { emoji: "💪", name: "muscle", keywords: ["strong", "flex"] },
  { emoji: "👀", name: "eyes", keywords: ["look", "watching"] },
  { emoji: "💯", name: "hundred", keywords: ["perfect", "score"] },
  { emoji: "🔥", name: "fire", keywords: ["hot", "great"] },
  { emoji: "✨", name: "sparkles", keywords: ["shine", "magic"] },
  { emoji: "🎉", name: "tada", keywords: ["party", "celebrate"] },
  { emoji: "🎙️", name: "studio_microphone", keywords: ["podcast", "record"] },
  { emoji: "🎧", name: "headphones", keywords: ["audio", "listen"] },
  { emoji: "🎬", name: "clapper", keywords: ["video", "action"] },
  { emoji: "📹", name: "video_camera", keywords: ["record", "camera"] },
  { emoji: "🎵", name: "musical_note", keywords: ["audio", "music"] },
  { emoji: "💡", name: "bulb", keywords: ["idea", "light"] },
  { emoji: "✅", name: "check", keywords: ["done", "yes"] },
  { emoji: "❌", name: "x", keywords: ["no", "cancel"] },
  { emoji: "⚠️", name: "warning", keywords: ["alert", "careful"] },
  { emoji: "❤️", name: "heart", keywords: ["love", "red"] },
  { emoji: "💜", name: "purple_heart", keywords: ["love", "wiplash"] },
  { emoji: "💔", name: "broken_heart", keywords: ["sad", "love"] },
  { emoji: "🚀", name: "rocket", keywords: ["launch", "fast"] },
  { emoji: "⭐", name: "star", keywords: ["favorite"] },
  { emoji: "🌟", name: "glowing_star", keywords: ["shine", "special"] },
  { emoji: "☕", name: "coffee", keywords: ["break", "drink"] },
  { emoji: "🍿", name: "popcorn", keywords: ["watch", "movie"] },
  { emoji: "🫶", name: "heart_hands", keywords: ["love", "support"] },
  { emoji: "🫠", name: "melting", keywords: ["awkward", "hot"] },
];

export function chatEmojiTokenAtCursor(value: string, cursor: number): ChatEmojiToken | null {
  const safeCursor = Math.min(value.length, Math.max(0, cursor));
  const match = value.slice(0, safeCursor).match(/(?:^|\s):([a-z0-9_+-]{0,32})$/i);
  if (!match) return null;
  const query = match[1] ?? "";
  return {
    end: safeCursor,
    query: query.toLowerCase(),
    start: safeCursor - query.length - 1,
  };
}

export function matchingChatEmojis(
  value: string,
  cursor: number,
  limit = 8,
): ChatEmoji[] {
  const token = chatEmojiTokenAtCursor(value, cursor);
  if (!token) return [];
  if (!token.query) return chatEmojis.slice(0, limit);
  return chatEmojis.filter((candidate) =>
    candidate.name.startsWith(token.query)
    || candidate.keywords.some((keyword) => keyword.startsWith(token.query)),
  ).slice(0, limit);
}

export function insertChatEmoji(
  value: string,
  cursor: number,
  emoji: ChatEmoji,
): { cursor: number; value: string } {
  const token = chatEmojiTokenAtCursor(value, cursor);
  const start = token?.start ?? cursor;
  const end = token?.end ?? cursor;
  const suffix = value.slice(end).startsWith(" ") ? "" : " ";
  const next = `${value.slice(0, start)}${emoji.emoji}${suffix}${value.slice(end)}`;
  return { cursor: start + emoji.emoji.length + suffix.length, value: next };
}
