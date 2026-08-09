"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Check, Palette } from "lucide-react";
import { authFetch } from "@/lib/api";
import type { StyleTemplate } from "@/types/styletemplate";
import type { Project } from "@/types/project";

interface ChooseStyleTemplatePopUpProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentSnapshotName: string | null;
  onImported: (project: Project) => void;
}

export const ChooseStyleTemplatePopUp = ({
  isOpen,
  onClose,
  projectId,
  currentSnapshotName,
  onImported,
}: ChooseStyleTemplatePopUpProps) => {
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg lg:max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Style Template</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-10 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              <Palette className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">No style templates in your library yet.</p>
            </div>
          ) : (
            templates.map((t) => {
              const isCurrent = currentSnapshotName === t.name;
              const isImporting = importingId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleImport(t.id)}
                  disabled={isImporting}
                  className={`text-left flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer disabled:cursor-wait ${
                    isCurrent
                      ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10"
                      : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50"
                  }`}
                >
                  <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                    <Palette className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">{t.name}</p>
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30">
                        {t.image_aspect_ratio === "9:16" ? "9:16 · Reels" : "16:9 · Long Video"}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {t.image_prompt}
                    </p>
                  </div>
                  <div className="flex-shrink-0 pt-1">
                    {isImporting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    ) : isCurrent ? (
                      <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
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
  );
};

export default ChooseStyleTemplatePopUp;
