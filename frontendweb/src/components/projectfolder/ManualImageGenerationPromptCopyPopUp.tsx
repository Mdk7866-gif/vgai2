"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Check, Copy, ImageIcon, Layers, Loader2, Users, X } from "lucide-react";
import { copyImagesToClipboard } from "@/lib/download";
import type { ProjectCharacter } from "@/types/project";
import type { Scene } from "@/types/scene";

const BATCH_SIZE_OPTIONS = [5, 10, 20] as const;
const DEFAULT_BATCH_SIZE = 10;

type CopyStatus = "idle" | "copying" | "copied" | "failed";

interface ManualImageGenerationPromptCopyPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  projectCharacters: ProjectCharacter[];
}

function buildBatchPrompt(batchScenes: Scene[]): string {
  const header =
    `Generate ${batchScenes.length} separate images from the prompts below, one image per prompt, in order. ` +
    `Keep every character exactly consistent with the reference sheet images attached in this chat. ` +
    `Output every image as a .png file only — never .webp or any other format. ` +
    `Name each output file exactly as given in its "File name" line below (e.g. scene_${batchScenes[0].scene_number}.png) so they save with the right name. ` +
    `Do not add any text, watermark, or label onto the images themselves (no scene numbers, no captions) — generate purely what each prompt describes; the file name is the only place the scene number should appear.\n`;

  const body = batchScenes
    .map((scene) => {
      const names = scene.involved_characters.map((c) => c.name);
      const charLine =
        names.length > 0 ? names.join(", ") : "None (no characters — object / environment / graphic only)";
      return (
        `--- Scene ${scene.scene_number} ---\n` +
        `File name: scene_${scene.scene_number}.png\n` +
        `Reference sheet: ${charLine}\n` +
        `Prompt: ${scene.scene_image_prompt || "(no image prompt)"}`
      );
    })
    .join("\n\n");

  return `${header}\n${body}`;
}

/** Pure copy-paste tool — the credit charge for this flow happens once, up
 * front, when the trigger button on the project page is clicked (before this
 * popup even opens, see page.tsx's handleOpenManualImages). This component
 * does nothing paid: it just builds character-sheet + batched-prompt copy
 * buttons for the user to paste into meta.ai themselves. */
export const ManualImageGenerationPromptCopyPopUp = ({
  isOpen,
  onClose,
  scenes,
  projectCharacters,
}: ManualImageGenerationPromptCopyPopUpProps) => {
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [statusByBatch, setStatusByBatch] = useState<Record<number, CopyStatus>>({});
  const [copyingCharId, setCopyingCharId] = useState<string | null>(null);
  const [copiedCharId, setCopiedCharId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const batches = useMemo(() => {
    const groups: Scene[][] = [];
    for (let i = 0; i < scenes.length; i += batchSize) {
      groups.push(scenes.slice(i, i + batchSize));
    }
    return groups;
  }, [scenes, batchSize]);

  const handleClose = () => {
    setError(null);
    setStatusByBatch({});
    onClose();
  };

  const handleCopyCharacterImage = async (character: ProjectCharacter) => {
    setError(null);
    setCopyingCharId(character.id);
    try {
      await copyImagesToClipboard([character.snapshot_character_sheet_url]);
      setCopiedCharId(character.id);
      setTimeout(() => setCopiedCharId(null), 1500);
    } catch {
      setError(`Couldn't copy ${character.snapshot_name}'s image — your browser may not support copying images.`);
    } finally {
      setCopyingCharId(null);
    }
  };

  const handleCopyBatch = async (batchIndex: number, batchScenes: Scene[]) => {
    setStatusByBatch((prev) => ({ ...prev, [batchIndex]: "copying" }));
    try {
      await navigator.clipboard.writeText(buildBatchPrompt(batchScenes));
      setStatusByBatch((prev) => ({ ...prev, [batchIndex]: "copied" }));
    } catch {
      setStatusByBatch((prev) => ({ ...prev, [batchIndex]: "failed" }));
    } finally {
      setTimeout(() => setStatusByBatch((prev) => ({ ...prev, [batchIndex]: "idle" })), 2000);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={handleClose} />

      <div className="relative w-full sm:max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ImageIcon className="w-4.5 h-4.5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Generate Images (Manual)</h2>
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
          <ol className="flex flex-col gap-1.5 text-[13px] text-slate-600 dark:text-slate-300 list-decimal list-inside">
            <li>
              Copy each character&apos;s sheet image below and paste them into a new chat on{" "}
              <a
                href="https://meta.ai"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                meta.ai
              </a>
              .
            </li>
            <li>Pick a batch below, copy it, and paste it into the same chat to generate that batch&apos;s images.</li>
            <li>Repeat for every batch, then save the images from meta.ai yourself.</li>
          </ol>

          {projectCharacters.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                <Users className="w-3.5 h-3.5" />
                1. Character sheets — copy once
              </h3>
              <p className="text-[12px] text-slate-400 dark:text-slate-500 mb-2.5">
                Your whole project only uses these {projectCharacters.length} sheet
                {projectCharacters.length !== 1 ? "s" : ""}. Paste them into the chat first — every batch below
                references them by name, so you never have to re-attach per scene.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {projectCharacters.map((c) => (
                  <div key={c.id} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => handleCopyCharacterImage(c)}
                      disabled={copyingCharId === c.id}
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
                          copiedCharId === c.id ? "bg-emerald-600/90" : "bg-black/60 hover:bg-black/75"
                        }`}
                      >
                        {copyingCharId === c.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Copying…
                          </>
                        ) : copiedCharId === c.id ? (
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
                    <div className="px-2.5 py-2 bg-white dark:bg-slate-800/70">
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
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <Layers className="w-3.5 h-3.5" />
                2. Copy prompts in batches
              </h3>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {scenes.length} scene{scenes.length !== 1 ? "s" : ""} · {batches.length} batch
                {batches.length !== 1 ? "es" : ""} of {batchSize}
              </span>
            </div>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mb-2.5">
              Each batch copies every scene prompt in that range as one block of text, and states which character
              sheet each scene needs.
            </p>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Batch size:</span>
              {BATCH_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setBatchSize(size);
                    setStatusByBatch({});
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                    batchSize === size
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            {batches.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No scenes to copy yet.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {batches.map((batchScenes, idx) => {
                  const first = batchScenes[0].scene_number;
                  const last = batchScenes[batchScenes.length - 1].scene_number;
                  const status = statusByBatch[idx] || "idle";
                  return (
                    <button
                      key={idx}
                      onClick={() => handleCopyBatch(idx, batchScenes)}
                      disabled={status === "copying"}
                      className={`flex flex-col items-center justify-center gap-1 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all active:scale-95 cursor-pointer ${
                        status === "copied"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                          : status === "failed"
                          ? "bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400"
                          : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:text-indigo-700 dark:hover:text-indigo-400"
                      }`}
                    >
                      {status === "copied" ? (
                        <Check className="w-4 h-4" />
                      ) : status === "failed" ? (
                        <X className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span>
                        {first}-{last}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ManualImageGenerationPromptCopyPopUp;
