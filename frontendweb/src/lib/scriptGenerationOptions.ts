import type { ContentType } from "@/types/scripttemplate";

// A broad set of common YouTube content categories — user can also type their own
// via the "Other" option in the dropdown (see generate_script/page.tsx).
export const CATEGORY_OPTIONS = [
  "Finance & Investing",
  "News & Current Affairs",
  "Entertainment",
  "Story/Drama (Fiction)",
  "True Crime & Mystery",
  "Motivational & Self-Improvement",
  "History",
  "Technology",
  "Health & Fitness",
  "Educational / How-To",
  "Comedy",
  "Gaming",
  "Travel",
  "Food & Cooking",
  "Science",
  "Horror / Creepy",
  "Business & Entrepreneurship",
  "Relationships & Lifestyle",
  "Sports",
  "Kids & Family",
];

export const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; sublabel: string }[] = [
  { value: "long_videos", label: "Long Video", sublabel: "16:9 landscape" },
  { value: "short_videos", label: "Reel / Shorts", sublabel: "9:16 vertical" },
];

// 100-word bands from 100-200 up to 1400-1500, matching the backend's
// WORDS_PER_CREDIT-based cost formula in viralscripttopicresearch.py.
export const WORD_LENGTH_OPTIONS: string[] = Array.from({ length: 14 }, (_, i) => {
  const low = 100 + i * 100;
  const high = low + 100;
  return `${low}-${high}`;
});

// Keep numerically in sync with WORDS_PER_CREDIT in
// backend/app/routes/scriptgenerationtemplate/viralscripttopicresearch.py.
export const WORDS_PER_CREDIT = 5;

export const TOPIC_RESEARCH_CREDIT_COST = 20;

export function scriptCreditCost(scriptWordLength: string): number {
  const upper = Number(scriptWordLength.split("-")[1]);
  return Number.isFinite(upper) ? upper / WORDS_PER_CREDIT : 0;
}

export const SCRIPT_DESCRIPTION_MAX_WORDS = 300;
