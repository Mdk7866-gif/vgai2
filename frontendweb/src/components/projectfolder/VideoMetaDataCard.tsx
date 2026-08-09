"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Check, Copy, FileText, ImageIcon, Loader2, Save, Sparkles } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import type { Project } from "@/types/project";

interface VideoMetaDataCardProps {
  project: Project;
  onThumbnailGenerated: (thumbnailImageUrl: string) => void;
  onMetadataSaved: (project: Project) => void;
}

type Field = "title" | "description" | "tags";

const fieldClass =
  "w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all resize-none";

export const VideoMetaDataCard = ({ project, onThumbnailGenerated, onMetadataSaved }: VideoMetaDataCardProps) => {
  const { setBalance } = useCreditBalance();
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

  const handleGenerateThumbnail = async () => {
    setGenerating(true);
    setError(null);
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
    } finally {
      setGenerating(false);
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
    "flex items-center gap-1 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  if (!project.title_of_video) return null;

  return (
    <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
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
              rows={4}
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

          <button
            onClick={handleSaveMetadata}
            disabled={saving || !dirty}
            className="self-end flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Metadata
          </button>
        </div>

        <div className="md:w-64 flex-shrink-0 flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Thumbnail
          </label>
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center">
            {project.thumbnail_image_url ? (
              <Image src={project.thumbnail_image_url} alt="Video thumbnail" fill unoptimized className="object-cover" />
            ) : (
              <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
            )}
          </div>
          <button
            onClick={handleGenerateThumbnail}
            disabled={generating}
            className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {project.thumbnail_image_url ? "Regenerate Thumbnail" : "Generate Thumbnail"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoMetaDataCard;
