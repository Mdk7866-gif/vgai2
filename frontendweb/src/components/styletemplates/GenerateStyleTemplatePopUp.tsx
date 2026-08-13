"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import type { StyleTemplate } from "@/types/styletemplate";
import CreditCoinIcon from "@/components/CreditCoinIcon";

const GENERATE_CREDIT_COST = 2;

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9", sublabel: "Long Video" },
  { value: "9:16", label: "9:16", sublabel: "Reels" },
] as const;

interface GenerateResult {
  description: string;
  image_prompt: string;
  animation_prompt: string;
  youtube_title_description_tags_prompt: string;
  youtube_thumbnail_image_prompt: string;
  credits_spent: number;
  credits_remaining: number;
}

interface GenerateStyleTemplatePopUpProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the user accepts a generated template and it's been saved to the library. */
  onAccepted: (template: StyleTemplate) => void;
}

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all";

const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";

export const GenerateStyleTemplatePopUp = ({
  isOpen,
  onClose,
  onAccepted,
}: GenerateStyleTemplatePopUpProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");

  const { balance, setBalance, refreshBalance } = useCreditBalance();
  const [loadingBalance, setLoadingBalance] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-check on every open (this component remounts on open via a `key` prop
  // on the parent) — the shared balance can go stale while this popup sits
  // closed (spent in another tab/page).
  useEffect(() => {
    let cancelled = false;
    refreshBalance().finally(() => {
      if (!cancelled) setLoadingBalance(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generating && !accepting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, generating, accepting]);

  const insufficientCredits = balance !== null && balance < GENERATE_CREDIT_COST;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }
    setError(null);

    const freshBalance = await refreshBalance();
    if (freshBalance !== null && freshBalance < GENERATE_CREDIT_COST) {
      setError(
        `Not enough credits — generating a style template costs ${GENERATE_CREDIT_COST} credits, you have ${freshBalance}.`
      );
      return;
    }

    setGenerating(true);
    try {
      const res = await authFetch("/styletemplates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_name: name.trim(),
          description: description.trim(),
          aspect_ratio: aspectRatio,
        }),
      });
      const data: GenerateResult = await res.json();
      setResult(data);
      setBalance(data.credits_remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  };

  const handleReject = () => {
    setResult(null);
    setError(null);
  };

  const handleAccept = async () => {
    if (!result) return;
    setAccepting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: result.description,
        image_prompt: result.image_prompt,
        animation_prompt: result.animation_prompt,
        youtube_title_description_tags_prompt: result.youtube_title_description_tags_prompt || null,
        youtube_thumbnail_image_prompt: result.youtube_thumbnail_image_prompt || null,
        scene_density: "small",
        image_aspect_ratio: aspectRatio,
        video_aspect_ratio: aspectRatio,
        is_default: false,
      };
      const res = await authFetch("/styletemplates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const created: StyleTemplate = await res.json();
      onAccepted(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAccepting(false);
    }
  };

  if (!isOpen) return null;

  const busy = generating || accepting;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
        onClick={() => !busy && onClose()}
      />

      <div className="relative w-full sm:max-w-lg lg:max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Generate Style Template
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5 min-h-[280px]">
          {generating ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Generating your style template…
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  This can take up to 15 seconds. Please wait.
                </p>
              </div>
            </div>
          ) : !result ? (
            <form id="generate-style-template-form" onSubmit={handleGenerate} className="flex flex-col gap-5">
              <div>
                <label htmlFor="gen-style-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="gen-style-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cinematic Realism"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="gen-style-description" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="gen-style-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the visual style you want — art style, mood, colors, references"
                  rows={5}
                  className={`${inputClass} resize-none`}
                />
              </div>

              <div>
                <label className={labelClass}>Aspect Ratio</label>
                <div className="grid grid-cols-2 gap-3">
                  {ASPECT_RATIO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAspectRatio(opt.value)}
                      aria-pressed={aspectRatio === opt.value}
                      className={`px-4 py-2.5 rounded-xl border text-sm font-semibold text-center transition-all cursor-pointer ${
                        aspectRatio === opt.value
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/30"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      {opt.label}
                      <span className="block text-xs font-normal opacity-75">{opt.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <span className="self-start inline-block px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30">
                {aspectRatio === "9:16" ? "9:16 · Reels" : "16:9 · Long Video"}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Description</h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5">
                  {result.description}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Image Prompt</h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5">
                  {result.image_prompt}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Animation Prompt</h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5">
                  {result.animation_prompt}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  YouTube Title/Description/Tags Prompt
                </h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5">
                  {result.youtube_title_description_tags_prompt}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  YouTube Thumbnail Prompt
                </h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5">
                  {result.youtube_thumbnail_image_prompt}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-auto px-6 py-4 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <CreditCoinIcon className="w-3.5 h-3.5" />
            {generating ? (
              <span>Generating…</span>
            ) : loadingBalance ? (
              <span>Checking balance…</span>
            ) : result ? (
              <span>{result.credits_spent} credits spent · {result.credits_remaining} remaining</span>
            ) : (
              <span className={insufficientCredits ? "text-red-600 dark:text-red-400" : ""}>
                {balance !== null ? `${balance} credits available` : ""}
              </span>
            )}
          </div>

          {generating ? null : !result ? (
            <button
              type="submit"
              form="generate-style-template-form"
              disabled={loadingBalance || insufficientCredits}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              Generate
              <span className="flex items-center gap-1 pl-2 ml-0.5 border-l border-white/30 text-indigo-100">
                <CreditCoinIcon className="w-3.5 h-3.5" />
                {GENERATE_CREDIT_COST}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleReject}
                disabled={accepting}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                Reject &amp; Retry
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md shadow-emerald-200 dark:shadow-emerald-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {accepting && <Loader2 className="w-4 h-4 animate-spin" />}
                Accept &amp; Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GenerateStyleTemplatePopUp;
