"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ChevronDown, ChevronUp, ImagePlus, Trash2, Sparkles } from "lucide-react";
import Image from "next/image";
import { authFetch } from "@/lib/api";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import type { SceneDensity, StyleTemplate } from "@/types/styletemplate";
import Toggle from "@/components/Toggle";
import CreditCoinIcon from "@/components/CreditCoinIcon";

// Flat cost of one "Generate" demo-image attempt — MUST stay numerically in
// sync with GENERATE_DEMO_IMAGE_CREDIT_COST in
// backend/app/routes/styletemplates/generatetemplate.py; nothing enforces
// this automatically (same caveat as every other generate-flow cost constant
// in this app).
const GENERATE_DEMO_IMAGE_CREDIT_COST = 4;

export interface StyleTemplateFormValues {
  name: string;
  description: string;
  imagePrompt: string;
  animationPrompt: string;
  youtubeTitleDescriptionTagsPrompt: string;
  youtubeThumbnailImagePrompt: string;
  sceneDensity: SceneDensity;
  imageAspectRatio: string;
  videoAspectRatio: string;
  bestFor: string;
  demoImageUrl: string;
  isDefault: boolean;
}

interface EditStyleTemplateCardPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  template?: StyleTemplate | null;
  onSubmit: (values: StyleTemplateFormValues) => Promise<void>;
  submitting?: boolean;
  /** "library" (default) edits a real style_templates row. "project" edits
   * one project's snapshot_styletemplate_* columns instead (opened from
   * ChooseStyleTemplatePopUp.tsx's "Currently applied" card) — there's no
   * `is_default` concept for a single project's own copy, and the snapshot
   * has no best_for/demo_image_url columns at all (see vgaidatabase.dbml),
   * so both are hidden in this scope rather than submitted and silently
   * dropped. */
  scope?: "library" | "project";
}

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9", sublabel: "Long Video" },
  { value: "9:16", label: "9:16", sublabel: "Reels" },
] as const;
const SCENE_DENSITIES: SceneDensity[] = ["small", "medium", "high"];

const IMAGE_PROMPT_MAX_WORDS = 300;
const ANIMATION_PROMPT_MAX_WORDS = 200;
const DESCRIPTION_MAX_WORDS = 150;
const YOUTUBE_PROMPT_MAX_WORDS = 150;

// Generic starting text for the advanced fields on a brand-new template, so a
// user who never opens Advanced Settings still ends up with a usable value —
// they can freely edit or replace any of this before saving.
const DEFAULT_DESCRIPTION =
  "A consistent visual style for this project — defines the art style, color palette, lighting, and mood applied across every generated character, scene image, and animation so the whole video looks cohesive from start to finish.";
const DEFAULT_YOUTUBE_TITLE_DESCRIPTION_TAGS_PROMPT =
  "Based on the video's script and topic, write a short, curiosity-driven YouTube title under 70 characters, a 2-3 sentence description that summarizes the story and encourages viewers to watch till the end, and 10-15 relevant SEO tags covering the video's topic, genre, and target audience.";
const DEFAULT_YOUTUBE_THUMBNAIL_PROMPT =
  "A bold, high-contrast YouTube thumbnail featuring the main character with an exaggerated expression, a simple uncluttered background that keeps focus on the subject, minimal large readable text, bright saturated colors, and strong contrast so it stands out at a small size in search results.";

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all";

const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";

export const EditStyleTemplateCardPopUp = ({
  isOpen,
  onClose,
  mode,
  template,
  onSubmit,
  submitting = false,
  scope = "library",
}: EditStyleTemplateCardPopUpProps) => {
  const isProjectScope = scope === "project";
  // Re-initialized fresh each time the popup opens because the parent
  // remounts this component with a new `key` per open (see StyleTemplatesPage).
  const [name, setName] = useState(template?.name ?? "");
  const [imagePrompt, setImagePrompt] = useState(template?.image_prompt ?? "");
  const [animationPrompt, setAnimationPrompt] = useState(template?.animation_prompt ?? "");
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);

  // Advanced settings — on create, seeded with generic defaults (editable/
  // replaceable) so a user who never opens this section still gets usable
  // values; on edit, always show the template's actual saved values.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [description, setDescription] = useState(
    template?.description ?? (mode === "create" ? DEFAULT_DESCRIPTION : "")
  );
  const [youtubeTitleDescriptionTagsPrompt, setYoutubeTitleDescriptionTagsPrompt] = useState(
    template?.youtube_title_description_tags_prompt ??
      (mode === "create" ? DEFAULT_YOUTUBE_TITLE_DESCRIPTION_TAGS_PROMPT : "")
  );
  const [youtubeThumbnailImagePrompt, setYoutubeThumbnailImagePrompt] = useState(
    template?.youtube_thumbnail_image_prompt ??
      (mode === "create" ? DEFAULT_YOUTUBE_THUMBNAIL_PROMPT : "")
  );
  const [sceneDensity, setSceneDensity] = useState<SceneDensity>(template?.scene_density ?? "small");
  const [aspectRatio, setAspectRatio] = useState<string>(
    template?.image_aspect_ratio === "9:16" ? "9:16" : "16:9"
  );
  const [bestFor, setBestFor] = useState(template?.best_for ?? "");
  // The demo image uploads immediately on pick (POST /styletemplates/upload_demo_image)
  // rather than riding along with the form, so create/update stay pure JSON —
  // this holds the URL that call returns, which is what gets submitted.
  const [demoImageUrl, setDemoImageUrl] = useState(template?.demo_image_url ?? "");
  const [uploadingDemoImage, setUploadingDemoImage] = useState(false);
  const [generatingDemoImage, setGeneratingDemoImage] = useState(false);
  const demoImageInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { balance, setBalance, refreshBalance } = useCreditBalance();

  const imagePromptWordCount = countWords(imagePrompt);
  const animationPromptWordCount = countWords(animationPrompt);
  const descriptionWordCount = countWords(description);
  const youtubeTitleDescriptionTagsWordCount = countWords(youtubeTitleDescriptionTagsPrompt);
  const youtubeThumbnailImagePromptWordCount = countWords(youtubeThumbnailImagePrompt);

  const imagePromptOverLimit = imagePromptWordCount > IMAGE_PROMPT_MAX_WORDS;
  const animationPromptOverLimit = animationPromptWordCount > ANIMATION_PROMPT_MAX_WORDS;
  const descriptionOverLimit = descriptionWordCount > DESCRIPTION_MAX_WORDS;
  const youtubeTitleDescriptionTagsOverLimit = youtubeTitleDescriptionTagsWordCount > YOUTUBE_PROMPT_MAX_WORDS;
  const youtubeThumbnailImagePromptOverLimit = youtubeThumbnailImagePromptWordCount > YOUTUBE_PROMPT_MAX_WORDS;

  const anyFieldOverLimit =
    imagePromptOverLimit ||
    animationPromptOverLimit ||
    descriptionOverLimit ||
    youtubeTitleDescriptionTagsOverLimit ||
    youtubeThumbnailImagePromptOverLimit;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, submitting]);

  const handleDemoImageChange = async (file: File | null) => {
    if (!file) return;
    setUploadingDemoImage(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("demo_image", file);
      const res = await authFetch("/styletemplates/upload_demo_image", { method: "POST", body });
      const { url } = await res.json();
      setDemoImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload demo image.");
    } finally {
      setUploadingDemoImage(false);
      // Clear the input so re-picking the same file after a failure still fires onChange.
      if (demoImageInputRef.current) demoImageInputRef.current.value = "";
    }
  };

  const handleGenerateDemoImage = async () => {
    if (!imagePrompt.trim()) {
      setError("Image prompt is required before generating a demo image.");
      return;
    }
    setError(null);

    // The shared balance can go stale while this popup sits open (spent
    // elsewhere in another tab) — same pre-submit staleness check every other
    // Generate flow in the app does before spending.
    const freshBalance = await refreshBalance();
    if (freshBalance !== null && freshBalance < GENERATE_DEMO_IMAGE_CREDIT_COST) {
      setError(
        `Not enough credits — generating a demo image costs ${GENERATE_DEMO_IMAGE_CREDIT_COST} credits, you have ${freshBalance}.`
      );
      return;
    }

    setGeneratingDemoImage(true);
    try {
      const res = await authFetch("/styletemplates/generate_demo_image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_prompt: imagePrompt.trim(),
          best_for: bestFor.trim() || null,
          aspect_ratio: aspectRatio,
        }),
      });
      const data: { demo_image_url: string; credits_spent: number; credits_remaining: number } =
        await res.json();
      setDemoImageUrl(data.demo_image_url);
      setBalance(data.credits_remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate demo image.");
    } finally {
      setGeneratingDemoImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !imagePrompt.trim() || !animationPrompt.trim()) {
      setError("Name, image prompt, and animation prompt are required.");
      return;
    }

    if (anyFieldOverLimit) {
      setError("One or more fields exceed the word limit.");
      return;
    }

    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        imagePrompt: imagePrompt.trim(),
        animationPrompt: animationPrompt.trim(),
        youtubeTitleDescriptionTagsPrompt: youtubeTitleDescriptionTagsPrompt.trim(),
        youtubeThumbnailImagePrompt: youtubeThumbnailImagePrompt.trim(),
        sceneDensity,
        imageAspectRatio: aspectRatio,
        videoAspectRatio: aspectRatio,
        bestFor: bestFor.trim(),
        demoImageUrl: demoImageUrl.trim(),
        isDefault,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:max-w-lg lg:max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isProjectScope ? "Edit Style Template for This Project" : mode === "create" ? "Add Style Template" : "Edit Style Template"}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5">
          {isProjectScope && (
            <p className="px-3.5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-[12.5px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
              You&apos;re editing this project&apos;s own copy — changes apply only here, not to the style
              template in your library or any other project that imported it.
            </p>
          )}

          <div>
            <label htmlFor="style-name" className={labelClass}>
              Name
            </label>
            <input
              id="style-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cinematic Realism"
              className={inputClass}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="style-image-prompt" className={labelClass}>
                Image Prompt
              </label>
              <span
                className={`text-xs font-medium tabular-nums ${
                  imagePromptOverLimit ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {imagePromptWordCount}/{IMAGE_PROMPT_MAX_WORDS} words
              </span>
            </div>
            <textarea
              id="style-image-prompt"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Prompt used to generate each scene's image"
              rows={4}
              className={`${inputClass} resize-none ${
                imagePromptOverLimit
                  ? "border-red-300 dark:border-red-500/60 focus:ring-red-500/50 focus:border-red-400"
                  : ""
              }`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="style-animation-prompt" className={labelClass}>
                Animation Prompt
              </label>
              <span
                className={`text-xs font-medium tabular-nums ${
                  animationPromptOverLimit ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {animationPromptWordCount}/{ANIMATION_PROMPT_MAX_WORDS} words
              </span>
            </div>
            <textarea
              id="style-animation-prompt"
              value={animationPrompt}
              onChange={(e) => setAnimationPrompt(e.target.value)}
              placeholder="Prompt used to animate each scene's image"
              rows={4}
              className={`${inputClass} resize-none ${
                animationPromptOverLimit
                  ? "border-red-300 dark:border-red-500/60 focus:ring-red-500/50 focus:border-red-400"
                  : ""
              }`}
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

          {!isProjectScope && (
            <div>
              <Toggle checked={isDefault} onChange={setIsDefault} label="Mark as default style template" />
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                Only one style template can be default — marking this one will unset any existing default.
              </p>
            </div>
          )}

          <div className="pt-1 border-t border-slate-100 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="mt-4 flex flex-col gap-5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="style-description" className={labelClass}>
                      Description
                    </label>
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        descriptionOverLimit ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {descriptionWordCount}/{DESCRIPTION_MAX_WORDS} words
                    </span>
                  </div>
                  <textarea
                    id="style-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What kind of visual style does this template produce?"
                    rows={2}
                    className={`${inputClass} resize-none ${
                      descriptionOverLimit
                        ? "border-red-300 dark:border-red-500/60 focus:ring-red-500/50 focus:border-red-400"
                        : ""
                    }`}
                  />
                </div>

                {!isProjectScope && (
                  <div>
                    <label htmlFor="style-best-for" className={labelClass}>
                      Best For
                      <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">(optional)</span>
                    </label>
                    <input
                      id="style-best-for"
                      type="text"
                      value={bestFor}
                      onChange={(e) => setBestFor(e.target.value)}
                      placeholder="e.g. History, biography, philosophy"
                      className={inputClass}
                    />
                    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                      The content niches this style suits. Shown on the card to help you pick between templates.
                    </p>
                  </div>
                )}

                {!isProjectScope && (
                <div>
                  <label className={labelClass}>
                    Demo Image
                    <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">(optional)</span>
                  </label>
                  <div className="flex items-start gap-3">
                    <input
                      ref={demoImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleDemoImageChange(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => demoImageInputRef.current?.click()}
                      disabled={uploadingDemoImage || generatingDemoImage}
                      aria-label={demoImageUrl ? "Replace demo image" : "Upload demo image"}
                      className="relative w-28 h-20 flex-shrink-0 rounded-xl overflow-hidden border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500 hover:border-indigo-400 hover:text-indigo-500 flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      {uploadingDemoImage || generatingDemoImage ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : demoImageUrl ? (
                        <Image src={demoImageUrl} alt="Demo image preview" fill unoptimized className="object-cover" />
                      ) : (
                        <ImagePlus className="w-5 h-5" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                        Paste a URL below, upload a sample frame, or generate one from your Image
                        Prompt — previewed on the card so a large library stays scannable at a glance.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleGenerateDemoImage}
                          disabled={
                            uploadingDemoImage ||
                            generatingDemoImage ||
                            (balance !== null && balance < GENERATE_DEMO_IMAGE_CREDIT_COST)
                          }
                          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {generatingDemoImage ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          {generatingDemoImage ? "Generating…" : demoImageUrl ? "Regenerate" : "Generate"}
                          <span className="flex items-center gap-0.5 text-slate-400 dark:text-slate-500">
                            <CreditCoinIcon className="w-3 h-3" />
                            {GENERATE_DEMO_IMAGE_CREDIT_COST}
                          </span>
                        </button>
                        {demoImageUrl && !uploadingDemoImage && !generatingDemoImage && (
                          <button
                            type="button"
                            onClick={() => setDemoImageUrl("")}
                            className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                      {generatingDemoImage && (
                        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                          This can take up to 30-60 seconds. Please wait.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                )}

                <div>
                  <label htmlFor="style-scene-density" className={labelClass}>
                    Scene Density
                  </label>
                  <select
                    id="style-scene-density"
                    value={sceneDensity}
                    onChange={(e) => setSceneDensity(e.target.value as SceneDensity)}
                    className={inputClass}
                  >
                    {SCENE_DENSITIES.map((d) => (
                      <option key={d} value={d}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="style-yt-title-desc" className={labelClass}>
                      YouTube Title/Description/Tags Prompt
                      <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">(optional)</span>
                    </label>
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        youtubeTitleDescriptionTagsOverLimit ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {youtubeTitleDescriptionTagsWordCount}/{YOUTUBE_PROMPT_MAX_WORDS} words
                    </span>
                  </div>
                  <textarea
                    id="style-yt-title-desc"
                    value={youtubeTitleDescriptionTagsPrompt}
                    onChange={(e) => setYoutubeTitleDescriptionTagsPrompt(e.target.value)}
                    placeholder="Prompt used to generate YouTube title, description and tags"
                    rows={3}
                    className={`${inputClass} resize-none ${
                      youtubeTitleDescriptionTagsOverLimit
                        ? "border-red-300 dark:border-red-500/60 focus:ring-red-500/50 focus:border-red-400"
                        : ""
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="style-yt-thumbnail" className={labelClass}>
                      YouTube Thumbnail Prompt
                      <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">(optional)</span>
                    </label>
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        youtubeThumbnailImagePromptOverLimit ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {youtubeThumbnailImagePromptWordCount}/{YOUTUBE_PROMPT_MAX_WORDS} words
                    </span>
                  </div>
                  <textarea
                    id="style-yt-thumbnail"
                    value={youtubeThumbnailImagePrompt}
                    onChange={(e) => setYoutubeThumbnailImagePrompt(e.target.value)}
                    placeholder="Prompt used to generate the YouTube thumbnail image"
                    rows={3}
                    className={`${inputClass} resize-none ${
                      youtubeThumbnailImagePromptOverLimit
                        ? "border-red-300 dark:border-red-500/60 focus:ring-red-500/50 focus:border-red-400"
                        : ""
                    }`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="px-6 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || anyFieldOverLimit}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "create" ? "Add Style Template" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default EditStyleTemplateCardPopUp;
