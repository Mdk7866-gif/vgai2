"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import type { SceneDensity, StyleTemplate } from "@/types/styletemplate";
import Toggle from "@/components/Toggle";

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
  isDefault: boolean;
}

interface EditStyleTemplateCardPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  template?: StyleTemplate | null;
  onSubmit: (values: StyleTemplateFormValues) => Promise<void>;
  submitting?: boolean;
}

const ASPECT_RATIOS = ["16:9", "9:16", "1:1"];
const SCENE_DENSITIES: SceneDensity[] = ["small", "medium", "high"];

const IMAGE_PROMPT_MAX_WORDS = 300;
const ANIMATION_PROMPT_MAX_WORDS = 200;
const DESCRIPTION_MAX_WORDS = 150;
const YOUTUBE_PROMPT_MAX_WORDS = 150;

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
}: EditStyleTemplateCardPopUpProps) => {
  // Re-initialized fresh each time the popup opens because the parent
  // remounts this component with a new `key` per open (see StyleTemplatesPage).
  const [name, setName] = useState(template?.name ?? "");
  const [imagePrompt, setImagePrompt] = useState(template?.image_prompt ?? "");
  const [animationPrompt, setAnimationPrompt] = useState(template?.animation_prompt ?? "");
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);

  // Advanced settings — placeholder defaults for now, will be revisited later.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [description, setDescription] = useState(template?.description ?? "");
  const [youtubeTitleDescriptionTagsPrompt, setYoutubeTitleDescriptionTagsPrompt] = useState(
    template?.youtube_title_description_tags_prompt ?? ""
  );
  const [youtubeThumbnailImagePrompt, setYoutubeThumbnailImagePrompt] = useState(
    template?.youtube_thumbnail_image_prompt ?? ""
  );
  const [sceneDensity, setSceneDensity] = useState<SceneDensity>(template?.scene_density ?? "small");
  const [imageAspectRatio, setImageAspectRatio] = useState(template?.image_aspect_ratio ?? ASPECT_RATIOS[0]);
  const [videoAspectRatio, setVideoAspectRatio] = useState(template?.video_aspect_ratio ?? ASPECT_RATIOS[0]);
  const [error, setError] = useState<string | null>(null);

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
        imageAspectRatio,
        videoAspectRatio,
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
            {mode === "create" ? "Add Style Template" : "Edit Style Template"}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5">
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
            <Toggle checked={isDefault} onChange={setIsDefault} label="Mark as default style template" />
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              Only one style template can be default — marking this one will unset any existing default.
            </p>
          </div>

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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <label htmlFor="style-image-aspect" className={labelClass}>
                      Image Aspect Ratio
                    </label>
                    <select
                      id="style-image-aspect"
                      value={imageAspectRatio}
                      onChange={(e) => setImageAspectRatio(e.target.value)}
                      className={inputClass}
                    >
                      {ASPECT_RATIOS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="style-video-aspect" className={labelClass}>
                      Video Aspect Ratio
                    </label>
                    <select
                      id="style-video-aspect"
                      value={videoAspectRatio}
                      onChange={(e) => setVideoAspectRatio(e.target.value)}
                      className={inputClass}
                    >
                      {ASPECT_RATIOS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
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
