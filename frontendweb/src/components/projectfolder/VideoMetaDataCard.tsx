"use client";

import React, { useState } from "react";
import Image from "next/image";
import { FileText, ImageIcon, Loader2, Sparkles, Tags } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import type { Project } from "@/types/project";

interface VideoMetaDataCardProps {
  project: Project;
  onThumbnailGenerated: (thumbnailImageUrl: string) => void;
}

export const VideoMetaDataCard = ({ project, onThumbnailGenerated }: VideoMetaDataCardProps) => {
  const { setBalance } = useCreditBalance();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <div className="md:w-64 flex-shrink-0 flex flex-col gap-2">
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
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div>
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Title</h4>
            <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100">{project.title_of_video}</p>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Description</h4>
            <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">
              {project.description_of_video}
            </p>
          </div>
          {project.tags_of_video && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                <Tags className="w-3 h-3" />
                Tags
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {project.tags_of_video.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag, i) => (
                  <span
                    key={`${tag}-${i}`}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoMetaDataCard;
