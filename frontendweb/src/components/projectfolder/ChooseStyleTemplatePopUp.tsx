"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, Loader2, Check, Palette, AlertTriangle, Pencil } from "lucide-react";
import { authFetch } from "@/lib/api";
import type { StyleTemplate } from "@/types/styletemplate";
import type { Project } from "@/types/project";
import EditStyleTemplateCardPopUp, { StyleTemplateFormValues } from "@/components/styletemplates/EditStyleTemplateCardPopUp";

interface ChooseStyleTemplatePopUpProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  /** The whole project, not just the snapshotted name — the "Currently
   * applied" section below reads every snapshot_styletemplate_* field
   * directly off this so it keeps rendering correctly even after the source
   * template has been deleted from the user's library (snapshots are a real
   * copy, per vgaidatabase.dbml — see CLAUDE.md's snapshotting-pattern note). */
  project: Project;
  onImported: (project: Project) => void;
}

export const ChooseStyleTemplatePopUp = ({
  isOpen,
  onClose,
  projectId,
  project,
  onImported,
}: ChooseStyleTemplatePopUpProps) => {
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editSnapshotOpen, setEditSnapshotOpen] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const startTimer = setTimeout(() => setLoading(true), 0);
    authFetch("/styletemplates/")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load style templates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
  }, [isOpen]);

  const handleImport = async (templateId: string) => {
    setImportingId(templateId);
    setError(null);
    try {
      const res = await authFetch(`/projects/${projectId}/styletemplate/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style_template_id: templateId }),
      });
      const data: Project = await res.json();
      onImported(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import style template.");
    } finally {
      setImportingId(null);
    }
  };

  // Reuses EditStyleTemplateCardPopUp.tsx's form in its "project" scope
  // (see that component's `scope` prop) so editing the snapshot doesn't
  // touch style_templates at all — onSubmit here PUTs the project's own
  // snapshot_styletemplate_* columns via /projects/update, never
  // /styletemplates/..., which is what keeps this project-local per
  // CLAUDE.md's snapshotting-pattern note.
  const handleSnapshotSubmit = async (values: StyleTemplateFormValues) => {
    setSavingSnapshot(true);
    try {
      const res = await authFetch(`/projects/update/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_styletemplate_name: values.name,
          snapshot_styletemplate_image_prompt: values.imagePrompt,
          snapshot_styletemplate_animation_prompt: values.animationPrompt,
          snapshot_styletemplate_youtube_title_description_tags_prompt:
            values.youtubeTitleDescriptionTagsPrompt || null,
          snapshot_styletemplate_youtube_thumbnail_image_prompt: values.youtubeThumbnailImagePrompt || null,
          snapshot_styletemplate_description: values.description,
          snapshot_styletemplate_image_aspect_ratio: values.imageAspectRatio,
          snapshot_styletemplate_video_aspect_ratio: values.videoAspectRatio,
          snapshot_styletemplate_scene_density: values.sceneDensity,
        }),
      });
      const data: Project = await res.json();
      onImported(data);
      setEditSnapshotOpen(false);
    } finally {
      setSavingSnapshot(false);
    }
  };

  if (!isOpen) return null;

  const snapshotName = project.snapshot_styletemplate_name;
  // Whether the snapshot still matches something live in the library — if not,
  // it won't get highlighted in the list below (nothing there matches it
  // anymore), so the standalone section explains why rather than leaving that
  // silent.
  const snapshotStillInLibrary = !loading && templates.some((t) => t.name === snapshotName);

  // A synthetic StyleTemplate built from the project's own snapshot fields —
  // EditStyleTemplateCardPopUp only ever reads template.<field> to seed the
  // form, never id/user_id/created_at/updated_at, so placeholder values there
  // are safe. best_for/demo_image_url have no snapshot equivalent (see that
  // component's `scope="project"` doc comment) and are hidden in that scope,
  // so null here is never shown or submitted.
  const snapshotAsTemplate: StyleTemplate | null = snapshotName
    ? {
        id: project.id,
        user_id: project.user_id,
        is_default: false,
        name: snapshotName,
        image_prompt: project.snapshot_styletemplate_image_prompt ?? "",
        animation_prompt: project.snapshot_styletemplate_animation_prompt ?? "",
        youtube_title_description_tags_prompt:
          project.snapshot_styletemplate_youtube_title_description_tags_prompt,
        youtube_thumbnail_image_prompt: project.snapshot_styletemplate_youtube_thumbnail_image_prompt,
        scene_density: project.snapshot_styletemplate_scene_density ?? "small",
        image_aspect_ratio: project.snapshot_styletemplate_image_aspect_ratio ?? "16:9",
        video_aspect_ratio: project.snapshot_styletemplate_video_aspect_ratio ?? "16:9",
        description: project.snapshot_styletemplate_description ?? "",
        best_for: null,
        demo_image_url: null,
        created_at: project.updated_at,
        updated_at: project.updated_at,
      }
    : null;

  return (
    <>
      {createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg lg:max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white dark:bg-surface shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-border max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Style Template</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-6">
          {/* Reads straight off the project's own snapshot_styletemplate_*
              columns, never the live /styletemplates/ list below — so this
              keeps showing exactly what's actually driving generation even
              after the source template is edited or deleted from the
              library (snapshots are a real, independent copy). */}
          {snapshotName && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5">
                Currently applied to this project
              </h3>
              <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-brand-500 bg-brand-50/60 dark:bg-brand-500/10">
                <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Palette className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">{snapshotName}</p>
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-500/30">
                      {project.snapshot_styletemplate_image_aspect_ratio === "9:16" ? "9:16 · Reels" : "16:9 · Long Video"}
                    </span>
                  </div>
                  {project.snapshot_styletemplate_image_prompt && (
                    <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {project.snapshot_styletemplate_image_prompt}
                    </p>
                  )}
                  {!snapshotStillInLibrary && !loading && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      No longer in your library, but this project keeps its own copy — generation is unaffected.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditSnapshotOpen(true)}
                    className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    View / Edit for this project
                  </button>
                </div>
                <Check className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-1" />
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5">
              Your Style Template Library
            </h3>
            <div className="flex flex-col gap-3">
            {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-10 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              <Palette className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">No style templates in your library yet.</p>
            </div>
          ) : (
            templates.map((t) => {
              const isCurrent = snapshotName === t.name;
              const isImporting = importingId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleImport(t.id)}
                  disabled={isImporting}
                  className={`text-left flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer disabled:cursor-wait ${
                    isCurrent
                      ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10"
                      : "border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-500/50"
                  }`}
                >
                  <div className="w-24 aspect-video flex-shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                    {t.demo_image_url ? (
                      <Image
                        src={t.demo_image_url}
                        alt=""
                        width={192}
                        height={108}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Palette className="w-4.5 h-4.5 text-brand-600 dark:text-brand-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">{t.name}</p>
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-500/30">
                        {t.image_aspect_ratio === "9:16" ? "9:16 · Reels" : "16:9 · Long Video"}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {t.image_prompt}
                    </p>
                  </div>
                  <div className="flex-shrink-0 pt-1">
                    {isImporting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                    ) : isCurrent ? (
                      <Check className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
            </div>
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-2 px-6 py-4 flex items-center justify-end bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
        document.body
      )}

      <EditStyleTemplateCardPopUp
        key={editSnapshotOpen ? "snapshot-open" : "snapshot-closed"}
        isOpen={editSnapshotOpen}
        onClose={() => !savingSnapshot && setEditSnapshotOpen(false)}
        mode="edit"
        scope="project"
        template={snapshotAsTemplate}
        onSubmit={handleSnapshotSubmit}
        submitting={savingSnapshot}
      />
    </>
  );
};

export default ChooseStyleTemplatePopUp;
