"use client";

import React, { useEffect, useState } from "react";
import { Plus, Palette, LogIn, Sparkles } from "lucide-react";
import CardGridSkeleton from "@/components/CardGridSkeleton";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api";
import type { StyleTemplate } from "@/types/styletemplate";
import StyleTemplateCard from "@/components/styletemplates/StyleTemplateCard";
import EditStyleTemplateCardPopUp, {
  StyleTemplateFormValues,
} from "@/components/styletemplates/EditStyleTemplateCardPopUp";
import GenerateStyleTemplatePopUp from "@/components/styletemplates/GenerateStyleTemplatePopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";

const PAGE_SIZE = 10;

export default function StyleTemplatesPage() {
  const { user, requireAuth, loading: authLoading } = useAuth();

  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { page, setPage, pageCount, pageItems, totalItems } = usePagination(templates, PAGE_SIZE);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupMode, setPopupMode] = useState<"create" | "edit">("create");
  const [editingTemplate, setEditingTemplate] = useState<StyleTemplate | null>(null);
  const [popupKey, setPopupKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [generatePopupOpen, setGeneratePopupOpen] = useState(false);
  const [generatePopupKey, setGeneratePopupKey] = useState(0);

  const [deleteTarget, setDeleteTarget] = useState<StyleTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingDefaultId, setTogglingDefaultId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    // AuthContext's initial getSession() hasn't resolved yet — `user` being
    // null right now doesn't mean logged out, it means "don't know yet." Bail
    // without touching `templates`/`loading` so the page stays on its initial
    // loading state instead of flashing the logged-out view.
    if (authLoading) return;

    let cancelled = false;

    if (!user) {
      const timer = setTimeout(() => {
        setTemplates([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const startTimer = setTimeout(() => setLoading(true), 0);

    authFetch("/styletemplates/")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setAlert({
            title: "Failed to load style templates",
            message: err instanceof Error ? err.message : "Something went wrong.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
  }, [user, authLoading]);

  const handleAddClick = () => {
    if (!requireAuth()) return;
    setPopupMode("create");
    setEditingTemplate(null);
    setPopupKey((k) => k + 1);
    setPopupOpen(true);
  };

  const handleGenerateClick = () => {
    if (!requireAuth()) return;
    setGeneratePopupKey((k) => k + 1);
    setGeneratePopupOpen(true);
  };

  const handleGenerated = (template: StyleTemplate) => {
    setTemplates((prev) => [template, ...prev]);
    setPage(1);
    setGeneratePopupOpen(false);
  };

  const handleEditClick = (template: StyleTemplate) => {
    if (!requireAuth()) return;
    setPopupMode("edit");
    setEditingTemplate(template);
    setPopupKey((k) => k + 1);
    setPopupOpen(true);
  };

  const handleDeleteClick = (template: StyleTemplate) => {
    if (!requireAuth()) return;
    setDeleteTarget(template);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await authFetch(`/styletemplates/delete/${target.id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== target.id));
    } catch (err) {
      setAlert({
        title: "Delete failed",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleToggleDefault = async (template: StyleTemplate) => {
    if (!requireAuth()) return;
    setTogglingDefaultId(template.id);
    try {
      const payload = {
        name: template.name,
        description: template.description,
        image_prompt: template.image_prompt,
        animation_prompt: template.animation_prompt,
        youtube_title_description_tags_prompt: template.youtube_title_description_tags_prompt,
        youtube_thumbnail_image_prompt: template.youtube_thumbnail_image_prompt,
        scene_density: template.scene_density,
        image_aspect_ratio: template.image_aspect_ratio,
        video_aspect_ratio: template.video_aspect_ratio,
        is_default: !template.is_default,
      };
      const res = await authFetch(`/styletemplates/update/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const updated: StyleTemplate = await res.json();
      // Only one style template can be default at a time — the backend already
      // cleared the previous default in the DB, mirror that locally.
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id === updated.id) return updated;
          return updated.is_default ? { ...t, is_default: false } : t;
        })
      );
    } catch (err) {
      setAlert({
        title: "Failed to update default",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setTogglingDefaultId(null);
    }
  };

  const handleFormSubmit = async (values: StyleTemplateFormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        name: values.name,
        description: values.description,
        image_prompt: values.imagePrompt,
        animation_prompt: values.animationPrompt,
        youtube_title_description_tags_prompt: values.youtubeTitleDescriptionTagsPrompt || null,
        youtube_thumbnail_image_prompt: values.youtubeThumbnailImagePrompt || null,
        scene_density: values.sceneDensity,
        image_aspect_ratio: values.imageAspectRatio,
        video_aspect_ratio: values.videoAspectRatio,
        is_default: values.isDefault,
      };

      if (popupMode === "create") {
        const res = await authFetch("/styletemplates/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const created: StyleTemplate = await res.json();
        // Only one style template can be default at a time — the backend already
        // cleared the previous default in the DB, mirror that locally.
        setTemplates((prev) => [
          created,
          ...(created.is_default ? prev.map((t) => ({ ...t, is_default: false })) : prev),
        ]);
        setPage(1);
      } else if (editingTemplate) {
        const res = await authFetch(`/styletemplates/update/${editingTemplate.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const updated: StyleTemplate = await res.json();
        setTemplates((prev) =>
          prev.map((t) => {
            if (t.id === updated.id) return updated;
            return updated.is_default ? { ...t, is_default: false } : t;
          })
        );
      }
      setPopupOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-16 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Style Templates
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-[15px] max-w-xl leading-relaxed">
            Save reusable visual styles — prompts, scene density, and aspect ratios — ready to import into any project.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleGenerateClick}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-indigo-200 dark:ring-indigo-500/40"
          >
            <Sparkles className="w-5 h-5" />
            <span>Generate Style Template</span>
          </button>
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-indigo-700 dark:ring-indigo-500"
          >
            <Plus className="w-5 h-5" />
            <span>Add Style Template</span>
          </button>
        </div>
      </div>

      {!authLoading && !user ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <Palette className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Login to view your style templates</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Your style template library is tied to your account.
          </p>
          <button
            onClick={() => requireAuth()}
            className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        </div>
      ) : loading ? (
        <CardGridSkeleton
          variant="panel"
          gridClassName="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5"
          count={PAGE_SIZE}
        />
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <Palette className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No style templates yet</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Add your first style template to start reusing it across projects.
          </p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {pageItems.map((template) => (
              <StyleTemplateCard
                key={template.id}
                template={template}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                onToggleDefault={handleToggleDefault}
                togglingDefault={togglingDefaultId === template.id}
              />
            ))}
          </div>
          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            itemLabel="style templates"
            onChange={setPage}
          />
        </div>
      )}

      {/* Both remount counters start at 0, so the keys are namespaced per popup —
          two siblings keyed plain `0` collide in React's sibling reconciliation. */}
      <EditStyleTemplateCardPopUp
        key={`edit-${popupKey}`}
        isOpen={popupOpen}
        onClose={() => setPopupOpen(false)}
        mode={popupMode}
        template={editingTemplate}
        onSubmit={handleFormSubmit}
        submitting={submitting}
      />

      <GenerateStyleTemplatePopUp
        key={`generate-${generatePopupKey}`}
        isOpen={generatePopupOpen}
        onClose={() => setGeneratePopupOpen(false)}
        onAccepted={handleGenerated}
      />

      <ConformationMessagePopUp
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Style Template"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
        confirming={deleting}
      />

      <AlertMessagePopUp
        isOpen={!!alert}
        onClose={() => setAlert(null)}
        title={alert?.title ?? ""}
        message={alert?.message ?? ""}
        type="error"
      />
    </div>
  );
}
