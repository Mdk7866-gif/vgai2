"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, ChevronUp, Copy, Download, FileText, ImageIcon, Loader2, Save, Sparkles } from "lucide-react";
import { authFetch } from "@/lib/api";
import { imageCreditCost } from "@/lib/credits";
import { AssetUnavailableError, downloadAsset, getFileExtension } from "@/lib/download";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import ImageZoomPopUp from "@/components/ImageZoomPopUp";
import type { Project } from "@/types/project";

interface VideoMetaDataCardProps {
  project: Project;
  onThumbnailGenerated: (thumbnailImageUrl: string) => void;
  onMetadataSaved: (project: Project) => void;
}

type Field = "title" | "description" | "tags";

const fieldClass =
  "w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 transition-all resize-none";

export const VideoMetaDataCard = ({ project, onThumbnailGenerated, onMetadataSaved }: VideoMetaDataCardProps) => {
  const { setBalance, reserveBalance, refreshBalance } = useCreditBalance();
  const thumbnailAspectClass = project.snapshot_styletemplate_video_aspect_ratio === "9:16"
    ? "aspect-[9/16]"
    : "aspect-video";
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks the last project-metadata snapshot we synced local state from, so
  // an external change (e.g. re-running "Generate Scenes") can refresh the
  // fields below without a useEffect — but only while the user has no
  // unsaved edits in progress. This is React's documented "adjust state
  // during rendering" pattern (a render-phase update bails out before
  // committing), not a plain state-from-props useEffect.
  const [syncedFrom, setSyncedFrom] = useState({
    title: project.title_of_video ?? "",
    description: project.description_of_video ?? "",
    tags: project.tags_of_video ?? "",
  });
  const [title, setTitle] = useState(syncedFrom.title);
  const [description, setDescription] = useState(syncedFrom.description);
  const [tags, setTags] = useState(syncedFrom.tags);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<Field | null>(null);
  const [thumbnailZoomOpen, setThumbnailZoomOpen] = useState(false);
  const [thumbnailDownload, setThumbnailDownload] = useState<"idle" | "loading" | "done">("idle");

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptSyncedFrom, setPromptSyncedFrom] = useState(project.thumbnail_prompt ?? "");
  const [thumbnailPrompt, setThumbnailPrompt] = useState(promptSyncedFrom);
  const [promptDirty, setPromptDirty] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);

  const latest = {
    title: project.title_of_video ?? "",
    description: project.description_of_video ?? "",
    tags: project.tags_of_video ?? "",
  };
  if (
    !dirty &&
    (latest.title !== syncedFrom.title || latest.description !== syncedFrom.description || latest.tags !== syncedFrom.tags)
  ) {
    setSyncedFrom(latest);
    setTitle(latest.title);
    setDescription(latest.description);
    setTags(latest.tags);
  }

  const latestPrompt = project.thumbnail_prompt ?? "";
  if (!promptDirty && latestPrompt !== promptSyncedFrom) {
    setPromptSyncedFrom(latestPrompt);
    setThumbnailPrompt(latestPrompt);
  }

  const persistThumbnailPrompt = async (value: string) => {
    if (value.trim() === (project.thumbnail_prompt ?? "").trim()) {
      setPromptDirty(false);
      return;
    }
    setPromptSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/update/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnail_prompt: value.trim() || null }),
      });
      const data: Project = await res.json();
      onMetadataSaved(data);
      setPromptDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save thumbnail prompt.");
    } finally {
      setPromptSaving(false);
    }
  };

  const handleGenerateThumbnail = async () => {
    if (promptDirty) {
      await persistThumbnailPrompt(thumbnailPrompt);
    }
    setGenerating(true);
    setError(null);
    // The backend reserves the cost before calling OpenAI, so drop the balance now.
    reserveBalance(imageCreditCost(project.image_model_id));
    try {
      const res = await authFetch("/projects/image/generate_thumbnail_and_save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      });
      const data = await res.json();
      onThumbnailGenerated(data.thumbnail_image_url);
      setBalance(data.credits_remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate thumbnail.");
      // Refunded, or rejected before anything was reserved — only the backend knows.
      void refreshBalance();
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadThumbnail = async () => {
    if (!project.thumbnail_image_url) return;
    setThumbnailDownload("loading");
    setError(null);
    try {
      await downloadAsset(
        project.thumbnail_image_url,
        `${project.name}_thumbnail.${getFileExtension(project.thumbnail_image_url, "png")}`
      );
      setThumbnailDownload("done");
    } catch (err) {
      setThumbnailDownload("idle");
      setError(
        err instanceof AssetUnavailableError
          ? `Couldn't download — the media host refused the file (HTTP ${err.status}).`
          : "Couldn't download — the file couldn't be reached."
      );
    }
  };

  const handleCopy = async (field: Field, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  const handleSaveMetadata = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/update/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title_of_video: title.trim(),
          description_of_video: description.trim(),
          tags_of_video: tags.trim(),
        }),
      });
      const data: Project = await res.json();
      onMetadataSaved(data);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save metadata.");
    } finally {
      setSaving(false);
    }
  };

  const copyButtonClass =
    "flex items-center gap-1 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  if (!project.title_of_video) return null;

  return (
    <div className="bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 pb-3 flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-700/60">
        <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <FileText className="w-4 h-4" />
        </div>
        <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100">Video Metadata</h3>
      </div>

      <div className="p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-3.5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Title
              </label>
              <button onClick={() => handleCopy("title", title)} disabled={!title} className={copyButtonClass} aria-label="Copy title">
                {copied === "title" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              className={`${fieldClass} text-[14px] font-medium`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Description
              </label>
              <button
                onClick={() => handleCopy("description", description)}
                disabled={!description}
                className={copyButtonClass}
                aria-label="Copy description"
              >
                {copied === "description" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
              rows={3}
              className={`${fieldClass} text-[13px] leading-relaxed`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Tags <span className="normal-case font-normal text-slate-400 dark:text-slate-500">(comma separated)</span>
              </label>
              <button onClick={() => handleCopy("tags", tags)} disabled={!tags} className={copyButtonClass} aria-label="Copy tags">
                {copied === "tags" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <textarea
              value={tags}
              onChange={(e) => {
                setTags(e.target.value);
                setDirty(true);
              }}
              rows={2}
              className={`${fieldClass} text-[13px]`}
            />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="md:w-[360px] flex-shrink-0 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Thumbnail
            </label>
            <button
              onClick={() => setPromptOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline decoration-blue-300 dark:decoration-blue-700 underline-offset-2 transition-colors cursor-pointer"
            >
              {promptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Prompt
            </button>
          </div>

          {promptOpen && (
            <div className="flex flex-col gap-1">
              <textarea
                value={thumbnailPrompt}
                onChange={(e) => {
                  setThumbnailPrompt(e.target.value);
                  setPromptDirty(true);
                }}
                onBlur={() => persistThumbnailPrompt(thumbnailPrompt)}
                placeholder="Describe the thumbnail image…"
                rows={3}
                className={`${fieldClass} text-[12.5px]`}
              />
              <span className="flex items-center gap-1 self-end text-[10.5px] text-slate-400 dark:text-slate-500">
                {promptSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                {promptSaving ? "Saving…" : "Auto-saved"}
              </span>
            </div>
          )}

          <div
            onClick={() => project.thumbnail_image_url && setThumbnailZoomOpen(true)}
            className={`relative w-full ${thumbnailAspectClass} rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center ${
              project.thumbnail_image_url ? "cursor-zoom-in" : ""
            }`}
          >
            {project.thumbnail_image_url ? (
              <>
                <Image src={project.thumbnail_image_url} alt="Video thumbnail" fill unoptimized className="object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadThumbnail();
                  }}
                  aria-label="Download thumbnail"
                  title="Download thumbnail"
                  className={`absolute top-1.5 right-1.5 p-1.5 rounded-lg text-white transition-colors cursor-pointer ${
                    thumbnailDownload === "done" ? "bg-emerald-600/90 hover:bg-emerald-600" : "bg-black/50 hover:bg-black/70"
                  }`}
                >
                  {thumbnailDownload === "loading" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : thumbnailDownload === "done" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                </button>
              </>
            ) : (
              <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
            )}
          </div>
          <button
            onClick={handleGenerateThumbnail}
            disabled={generating}
            className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {project.thumbnail_image_url ? "Regenerate Thumbnail" : "Generate Thumbnail"}
          </button>
          <button
            onClick={handleSaveMetadata}
            disabled={saving || !dirty}
            className="flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-semibold text-action-foreground bg-action hover:bg-action-hover rounded-lg shadow-md shadow-brand-200 dark:shadow-brand-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Metadata
          </button>
        </div>
      </div>

      {project.thumbnail_image_url && (
        <ImageZoomPopUp
          isOpen={thumbnailZoomOpen}
          onClose={() => setThumbnailZoomOpen(false)}
          imageUrl={project.thumbnail_image_url}
          alt="Video thumbnail"
        />
      )}
    </div>
  );
};

export default VideoMetaDataCard;
