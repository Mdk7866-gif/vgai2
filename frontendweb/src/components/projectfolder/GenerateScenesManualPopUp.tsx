"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Check, ClipboardList, Copy, ImageIcon, Loader2, Sparkles, Users, X } from "lucide-react";
import { authFetch } from "@/lib/api";
import { copyImagesToClipboard } from "@/lib/download";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import CreditCoinIcon from "@/components/CreditCoinIcon";
import type { Project, ProjectCharacter } from "@/types/project";
import type { GenerateScenesResponse } from "@/types/scene";

// Mirrors app/routes/project/scenesplitcommon.py — 1 credit per 200 script
// words. The backend charges before this popup opens; this is display-only.
const WORDS_PER_CREDIT_MANUAL = 200;

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

type PreparedManualResponse = {
  json: string;
  repairedUnescapedQuotes: boolean;
  discardedRepeatedResponse: boolean;
};

/** Gemini is asked for strict JSON, but a long response can still contain an
 * unescaped quotation mark in narration or repeat the entire object. Repair
 * only the unambiguous former case and retain the first complete object in the
 * latter case. Unlike a generic JSON-repair package, this never silently
 * truncates narration. The backend remains the authoritative schema validator. */
function prepareManualResponse(raw: string): PreparedManualResponse {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  try {
    JSON.parse(text);
    return { json: text, repairedUnescapedQuotes: false, discardedRepeatedResponse: false };
  } catch {
    // Continue with the narrow repair below.
  }

  let repaired = "";
  let inString = false;
  let escaped = false;
  let repairedUnescapedQuotes = false;

  const nextNonWhitespaceIndex = (from: number) => {
    let index = from;
    while (index < text.length && /\s/.test(text[index])) index += 1;
    return index;
  };

  const quoteClosesString = (quoteIndex: number) => {
    const nextIndex = nextNonWhitespaceIndex(quoteIndex + 1);
    const next = text[nextIndex];
    if (!next || next === ":" || next === "}" || next === "]") return true;
    if (next !== ",") return false;

    // A comma closes a string value only when it starts the next object key.
    // Otherwise it is punctuation inside quoted narration.
    const following = nextNonWhitespaceIndex(nextIndex + 1);
    return /^"(?:\\.|[^"\\])*"\s*:/.test(text.slice(following));
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (!inString) {
      if (character === '"') inString = true;
      repaired += character;
      continue;
    }

    if (escaped) {
      escaped = false;
      repaired += character;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      repaired += character;
      continue;
    }
    if (character === '"') {
      if (quoteClosesString(index)) {
        inString = false;
        repaired += character;
      } else {
        repaired += '\\"';
        repairedUnescapedQuotes = true;
      }
      continue;
    }
    repaired += character;
  }

  const objectStart = repaired.indexOf("{");
  if (objectStart === -1) {
    throw new Error("Gemini's response has no JSON object. Ask it to return the response again as JSON only.");
  }

  let depth = 0;
  inString = false;
  escaped = false;
  let objectEnd = -1;
  for (let index = objectStart; index < repaired.length; index += 1) {
    const character = repaired[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      objectEnd = index;
      break;
    }
  }

  if (objectEnd === -1) {
    throw new Error("Gemini's response ends before its JSON object is complete. Ask it to generate the JSON again.");
  }

  const json = repaired.slice(objectStart, objectEnd + 1);
  try {
    JSON.parse(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown JSON error";
    throw new Error(`Gemini returned invalid JSON (${reason}). Ask it to regenerate one valid JSON object.`);
  }

  return {
    json,
    repairedUnescapedQuotes,
    discardedRepeatedResponse: repaired.slice(objectEnd + 1).trim().startsWith("{"),
  };
}

interface GenerateScenesManualPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  projectCharacters: ProjectCharacter[];
  onGenerated: (data: GenerateScenesResponse) => void;
}

/** Builds the copy-paste prompt for Gemini. Mirrors the shape the backend's
 * SceneSplitDraft/SceneDraft/VideoMetadataDraft pydantic models expect (see
 * scenesplitcommon.py + freescripttoscenesplitter.py's parser) — if either side's
 * schema changes, keep this in sync. */
function buildManualPrompt(project: Project, characters: ProjectCharacter[]): string {
  const styleBrief = [
    `Style template name: ${project.snapshot_styletemplate_name ?? ""}`,
    `Image style prompt: ${project.snapshot_styletemplate_image_prompt ?? ""}`,
    `Animation style prompt: ${project.snapshot_styletemplate_animation_prompt ?? ""}`,
    `YouTube title/description/tags prompt: ${project.snapshot_styletemplate_youtube_title_description_tags_prompt ?? ""}`,
    `YouTube thumbnail prompt: ${project.snapshot_styletemplate_youtube_thumbnail_image_prompt ?? ""}`,
    `Style description: ${project.snapshot_styletemplate_description ?? ""}`,
    `Scene density: ${project.snapshot_styletemplate_scene_density ?? ""} (small = ~1-10 words of narration per scene, medium = ~10-15, high = ~15-25)`,
    `Image aspect ratio: ${project.snapshot_styletemplate_image_aspect_ratio ?? ""}`,
    `Video aspect ratio: ${project.snapshot_styletemplate_video_aspect_ratio ?? ""}`,
  ].join("\n");

  const charactersBrief =
    characters.length > 0
      ? characters.map((c) => `- ${c.snapshot_name}: ${c.snapshot_description}`).join("\n")
      : "None available.";

  return `You are a video-production assistant for an AI faceless-content creator. Given a full narration script, the visual style template chosen for this video, and the list of characters available to appear in it, break the script down into a sequence of scenes ready for image/animation generation.

Respond with ONLY raw JSON (no markdown, no code fences, no prose outside the JSON) shaped EXACTLY like this:

{
  "scenes": [
    {
      "scene_number": 1,
      "scene_text": "the exact slice of narration this scene covers",
      "scene_image_prompt": "a prompt for generating this scene's specific visual — subject, action, setting, framing — WITHOUT restating the overall art style",
      "scene_animation_prompt": "a prompt for animating this scene's image — camera movement, motion — also WITHOUT restating the art style",
      "involved_character_names": ["exact character name(s) from the list below appearing in this scene, empty array if none"]
    }
  ],
  "metadata": {
    "title": "YouTube video title",
    "description": "YouTube video description",
    "tags": "comma-separated YouTube tags",
    "thumbnail_prompt": "an image prompt for a YouTube thumbnail"
  },
  "compact_image_prompt": "ONE short reusable style-prefix fragment (art style, rendering technique, color treatment, linework, aspect ratio) that will be prepended to every scene's scene_image_prompt — individual scene prompts should NOT restate the style",
  "compact_animation_prompt": "the same idea for scene_animation_prompt (motion/camera style, aspect ratio)"
}

Rules:
- scenes must cover the ENTIRE script below with no gaps or overlaps, scene_number sequential starting at 1.
- Target roughly the given scene-density word count per scene when deciding how often to break into a new scene.
- Follow the given YouTube prompts for metadata tone/format.
- Return exactly ONE top-level JSON object, once only. Do not repeat or append a second response.
- Before sending, ensure the response is valid JSON. Escape every double quote inside a text value as \`\\"\`.

${styleBrief}

Characters available:
${charactersBrief}

Full script:
${project.script ?? ""}`;
}

export const GenerateScenesManualPopUp = ({
  isOpen,
  onClose,
  project,
  projectCharacters,
  onGenerated,
}: GenerateScenesManualPopUpProps) => {
  const { setBalance, refreshBalance } = useCreditBalance();

  const [rawResponse, setRawResponse] = useState("");
  const [generating, setGenerating] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [copiedImageId, setCopiedImageId] = useState<string | null>(null);
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const prompt = useMemo(() => buildManualPrompt(project, projectCharacters), [project, projectCharacters]);
  const cost = Math.ceil(countWords(project.script ?? "") / WORDS_PER_CREDIT_MANUAL) || 0;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1500);
    } catch {
      setError("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  const handleCopyImage = async (character: ProjectCharacter) => {
    setError(null);
    setCopyingImageId(character.id);
    try {
      await copyImagesToClipboard([character.snapshot_character_sheet_url]);
      setCopiedImageId(character.id);
      setTimeout(() => setCopiedImageId(null), 1500);
    } catch {
      setError(`Couldn't copy ${character.snapshot_name}'s image — your browser may not support copying images.`);
    } finally {
      setCopyingImageId(null);
    }
  };

  const handleClose = () => {
    if (generating) return;
    setRawResponse("");
    setError(null);
    setNotice(null);
    onClose();
  };

  const handleGenerate = async () => {
    if (!rawResponse.trim()) return;
    setError(null);
    setNotice(null);

    let preparedResponse: PreparedManualResponse;
    try {
      preparedResponse = prepareManualResponse(rawResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini returned invalid JSON.");
      return;
    }

    const repairs: string[] = [];
    if (preparedResponse.repairedUnescapedQuotes) repairs.push("escaped quotation marks inside narration");
    if (preparedResponse.discardedRepeatedResponse) repairs.push("used the first of two repeated responses");
    if (repairs.length > 0) setNotice(`We fixed the pasted response: ${repairs.join(" and ")}.`);

    // Credits were already charged the instant this popup was opened (see
    // page.tsx's handleOpenManualScenes) — this step only parses/persists the
    // pasted response, so there's no balance check or reserve here. A malformed
    // paste can be fixed and retried for free.
    setGenerating(true);
    try {
      const res = await authFetch("/projects/scenes/generate_manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, raw_response: preparedResponse.json }),
      });
      const data: GenerateScenesResponse = await res.json();
      setBalance(data.credits_remaining);
      onGenerated(data);
      setRawResponse("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate scenes.");
      void refreshBalance();
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={handleClose} />

      <div className="relative w-full sm:max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white dark:bg-surface shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-border max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ClipboardList className="w-4.5 h-4.5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Generate Scenes (Manual)</h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5">
          {cost > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 text-[12.5px] text-emerald-700 dark:text-emerald-400">
              <CreditCoinIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                <strong>{cost} credits</strong> were already charged when you opened this — pasting Gemini&apos;s
                response back below is free, including retries.
              </span>
            </div>
          )}

          <ol className="flex flex-col gap-1.5 text-[13px] text-slate-600 dark:text-slate-300 list-decimal list-inside">
            <li>Copy the prompt below.</li>
            <li>
              Paste it into{" "}
              <a
                href="https://gemini.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                gemini.google.com
              </a>{" "}
              then select a Gemini Pro model and run it.
            </li>
            {projectCharacters.length > 0 && (
              <li>Copy each character sheet image below and paste it into that same Gemini chat before running the prompt.</li>
            )}
            <li>Copy Gemini&apos;s full JSON response.</li>
            <li>Paste it back below and click Generate.</li>
          </ol>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                1. Prompt to copy
              </label>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-all cursor-pointer"
              >
                {promptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {promptCopied ? "Copied" : "Copy Prompt"}
              </button>
            </div>
            <textarea
              readOnly
              value={prompt}
              rows={6}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-[12px] font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>

          {projectCharacters.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                <Users className="w-3.5 h-3.5" />
                Characters included in this prompt
              </h3>
              <p className="text-[12px] text-slate-400 dark:text-slate-500 mb-2.5">
                Copy the prompt above, paste it into gemini.google.com, choose a Gemini Pro model, then copy each character&apos;s sheet image below and
                paste it in the same chat too so Gemini keeps each character&apos;s look consistent.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {projectCharacters.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
                  >
                    <button
                      type="button"
                      onClick={() => handleCopyImage(c)}
                      disabled={copyingImageId === c.id}
                      aria-label={`Copy ${c.snapshot_name}'s sheet image to your clipboard`}
                      className="relative block w-full aspect-video bg-slate-100 dark:bg-slate-900 cursor-pointer disabled:cursor-wait"
                    >
                      <Image
                        src={c.snapshot_character_sheet_url}
                        alt={c.snapshot_name}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      <span
                        className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-white transition-colors ${
                          copiedImageId === c.id ? "bg-emerald-600/90" : "bg-black/60 hover:bg-black/75"
                        }`}
                      >
                        {copyingImageId === c.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Copying…
                          </>
                        ) : copiedImageId === c.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3.5 h-3.5" />
                            Click to copy image
                          </>
                        )}
                      </span>
                    </button>
                    <div className="px-2.5 py-2 bg-white dark:bg-surface">
                      <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">
                        {c.snapshot_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              2. Paste Gemini&apos;s JSON response
            </label>
            <textarea
              value={rawResponse}
              onChange={(e) => setRawResponse(e.target.value)}
              placeholder="Paste the structured JSON response here…"
              rows={8}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 transition-all resize-none"
            />
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {notice && <p className="px-6 pb-2 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

        <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <button
            onClick={handleClose}
            disabled={generating}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !rawResponse.trim()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-action-foreground bg-action hover:bg-action-hover rounded-lg shadow-md shadow-brand-200 dark:shadow-brand-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GenerateScenesManualPopUp;
