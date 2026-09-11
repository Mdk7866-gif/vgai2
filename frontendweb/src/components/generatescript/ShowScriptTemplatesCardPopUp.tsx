"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FolderInput, Layers, Loader2, Trash2, X } from "lucide-react";
import { authFetch } from "@/lib/api";
import type { ScriptTemplate } from "@/types/scripttemplate";

interface ShowScriptTemplatesCardPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (template: ScriptTemplate) => void;
  /** Fired after a template is deleted, so the parent can drop any state tied to it. */
  onDelete?: (templateId: string) => void;
}

const contentTypeLabel = (t: ScriptTemplate["content_type"]) =>
  t === "long_videos" ? "Long Video" : "Reel / Shorts";

export const ShowScriptTemplatesCardPopUp = ({
  isOpen,
  onClose,
  onImport,
  onDelete,
}: ShowScriptTemplatesCardPopUpProps) => {
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const startTimer = setTimeout(() => {
      setLoading(true);
      setError(null);
    }, 0);
    authFetch("/scripttemplates/")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load script templates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleDelete = async (template: ScriptTemplate) => {
    setDeletingId(template.id);
    try {
      await authFetch(`/scripttemplates/delete/${template.id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      onDelete?.(template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete script template.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full sm:max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white dark:bg-surface shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-border max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">My Script Templates</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-3 min-h-[200px]">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-16">
              <div className="w-12 h-12 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 rounded-xl flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">No saved templates yet</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                Fill in the form and click &ldquo;Save as Template&rdquo; to reuse it later.
              </p>
            </div>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                className="rounded-xl border border-slate-200 dark:border-border p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-500/30">
                      {template.category}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300">
                      {contentTypeLabel(template.content_type)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300">
                      {template.target_country}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300 tabular-nums">
                      {template.script_word_length} words
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {template.topic_description}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onImport(template)}
                    aria-label={`Import template for ${template.category}`}
                    className="p-2 rounded-full bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 shadow-sm hover:shadow transition-all cursor-pointer"
                    title="Import into form"
                  >
                    <FolderInput className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    disabled={deletingId === template.id}
                    aria-label={`Delete template for ${template.category}`}
                    className="p-2 rounded-full bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 shadow-sm hover:shadow transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Delete template"
                  >
                    {deletingId === template.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ShowScriptTemplatesCardPopUp;
