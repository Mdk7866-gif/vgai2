"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Palette, LogIn, Sparkles, Library, FileDown } from "lucide-react";
import CardGridSkeleton from "@/components/CardGridSkeleton";
import LibrarySearch from "@/components/LibrarySearch";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api";
import type { DefaultStyleTemplate, StyleTemplate } from "@/types/styletemplate";
import StyleTemplateCard from "@/components/styletemplates/StyleTemplateCard";
import DefaultStyleTemplateCardPopUp from "@/components/styletemplates/DefaultStyleTemplateCardPopUp";
import EditStyleTemplateCardPopUp, {
  StyleTemplateFormValues,
} from "@/components/styletemplates/EditStyleTemplateCardPopUp";
import GenerateStyleTemplatePopUp from "@/components/styletemplates/GenerateStyleTemplatePopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import { parseStyleTemplateImport } from "@/lib/styleTemplateImport";

const PAGE_SIZE = 10;

// The exact fields defaults.py's import_default_style_template() copies
// verbatim from a catalog entry into the new row (see _IMPORTABLE_FIELDS in
// app/routes/styletemplates/defaults.py) — a template counts as "imported
// from this catalog entry" if every one of these still matches, which is how
// the "Added" badge survives a page reload without any separate DB column:
// nothing needs to be persisted, it's re-derived from data already on both
// sides. It stops matching (and the card reverts to "Add to Library") the
// moment the user edits the imported copy, since it's then a genuinely
// different template — which is the correct behavior, not a bug.
//
// `demo_image_url` is deliberately NOT here, and must not be added back: the
// import makes a real Cloudinary copy into the user's own folder, so the URL
// differs from the catalog's on every import by design. Matching on it would
// mean the badge never matches at all.
const IMPORT_MATCH_FIELDS = [
  "name",
  "description",
  "image_prompt",
  "animation_prompt",
  "youtube_title_description_tags_prompt",
  "youtube_thumbnail_image_prompt",
  "scene_density",
  "image_aspect_ratio",
  "video_aspect_ratio",
  "best_for",
] as const;

function matchesDefault(template: StyleTemplate, def: DefaultStyleTemplate): boolean {
  return IMPORT_MATCH_FIELDS.every((field) => (template[field] ?? null) === (def[field] ?? null));
}

type AspectFilter = "all" | "16:9" | "9:16";

const ASPECT_FILTER_OPTIONS: { value: AspectFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "16:9", label: "16:9 · Long Video" },
  { value: "9:16", label: "9:16 · Reels" },
];

export default function StyleTemplatesPage() {
  const { user, requireAuth, loading: authLoading } = useAuth();

  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [aspectFilter, setAspectFilter] = useState<AspectFilter>("all");
  const filteredTemplates = useMemo(
    () => templates.filter((t) => (aspectFilter === "all" || t.image_aspect_ratio === aspectFilter) && `${t.name} ${t.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())),
    [templates, aspectFilter, query]
  );
  const { page, setPage, pageCount, pageItems, totalItems } = usePagination(filteredTemplates, PAGE_SIZE);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupMode, setPopupMode] = useState<"create" | "edit">("create");
  const [editingTemplate, setEditingTemplate] = useState<StyleTemplate | null>(null);
  const [popupKey, setPopupKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [generatePopupOpen, setGeneratePopupOpen] = useState(false);
  const [generatePopupKey, setGeneratePopupKey] = useState(0);

  // Starter catalog — static, public, and independent of auth, so it loads once
  // on mount rather than alongside the user's own templates.
  const [defaults, setDefaults] = useState<DefaultStyleTemplate[]>([]);
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [defaultsPopupOpen, setDefaultsPopupOpen] = useState(false);
  const [importingSlug, setImportingSlug] = useState<string | null>(null);
  // Derived from data, not tracked as its own state — see IMPORT_MATCH_FIELDS
  // above for why this survives a page reload without a dedicated DB column.
  const importedSlugs = useMemo(
    () => defaults.filter((def) => templates.some((t) => matchesDefault(t, def))).map((def) => def.slug),
    [defaults, templates]
  );

  const [deleteTarget, setDeleteTarget] = useState<StyleTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingDefaultId, setTogglingDefaultId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  // Import-from-JSON — a hidden file input triggered by the "Import" header
  // button, so the native file picker still opens off a direct user gesture.
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

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

  // The catalog is public (GET /styletemplates/defaults needs no token), so this
  // runs once on mount rather than keying off `user` like the effect above —
  // a signed-out visitor sees the starter library too.
  useEffect(() => {
    let cancelled = false;
    authFetch("/styletemplates/defaults")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setDefaults(data);
      })
      // Deliberately silent: the catalog is a nice-to-have next to the user's
      // own library, and an alert here would fire on a page that otherwise
      // loaded fine.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDefaultsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleImportDefault = async (template: DefaultStyleTemplate) => {
    if (!requireAuth()) return;
    setImportingSlug(template.slug);
    try {
      const res = await authFetch(`/styletemplates/defaults/${template.slug}/import`, {
        method: "POST",
      });
      const created: StyleTemplate = await res.json();
      // The backend marks a user's first-ever template default, so mirror that
      // locally the same way create/update do.
      setTemplates((prev) => [
        created,
        ...(created.is_default ? prev.map((t) => ({ ...t, is_default: false })) : prev),
      ]);
      setPage(1);
    } catch (err) {
      setAlert({
        title: "Import failed",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setImportingSlug(null);
    }
  };

  const handleImportClick = () => {
    if (!requireAuth()) return;
    importInputRef.current?.click();
  };

  const handleImportFileChange = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const payload = parseStyleTemplateImport(text);
      const res = await authFetch("/styletemplates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Imported templates never inherit is_default from the shared file —
        // that flag is local to whoever created it and could silently steal
        // the importer's own existing default otherwise.
        body: JSON.stringify({ ...payload, is_default: false }),
      });
      const created: StyleTemplate = await res.json();
      setTemplates((prev) => [created, ...prev]);
      setPage(1);
    } catch (err) {
      setAlert({
        title: "Import failed",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setImporting(false);
      // Clear the input so re-picking the same file after a failure still fires onChange.
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

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
        best_for: template.best_for,
        demo_image_url: template.demo_image_url,
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
        best_for: values.bestFor || null,
        demo_image_url: values.demoImageUrl || null,
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
      <div className="relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl border border-brand-200/60 bg-gradient-to-br from-white via-brand-50/70 to-cyan-50/60 p-6 shadow-sm dark:border-white/10 dark:from-surface dark:via-surface dark:to-slate-900 lg:p-8">
        <div>
          <p className="eyebrow mb-3">A signature for every scene</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Style Templates
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-[15px] max-w-xl leading-relaxed">
            Save reusable visual styles — prompts, scene density, and aspect ratios — ready to import into any project.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full">
          {/* Reserves the same slot/size whether the catalog is still loading,
              loaded with entries, or (rarely) empty/failed — swapping this in
              only once `defaults.length > 0` resolves caused every page load
              to show the header row without this button and then pop it in a
              moment later, a CLS regression. A skeleton of identical padding/
              icon/text-width dimensions removes the shift for the common case;
              the one remaining shift (skeleton → nothing) only happens on the
              rare empty/failed-fetch outcome. */}
          {defaultsLoading ? (
            <div
              aria-hidden="true"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl flex-1 sm:flex-none justify-center ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-800"
            >
              <div className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
              <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </div>
          ) : (
            defaults.length > 0 && (
              <button
                onClick={() => setDefaultsPopupOpen(true)}
                className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-brand-600 dark:text-brand-400 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-brand-200 dark:ring-brand-500/40"
              >
                <Library className="w-5 h-5" />
                <span>Starter Templates</span>
              </button>
            )
          )}
          <button
            onClick={handleGenerateClick}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-brand-600 dark:text-brand-400 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-brand-200 dark:ring-brand-500/40"
          >
            <Sparkles className="w-5 h-5" />
            <span>Generate Style Template</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            // .txt/text/plain accepted alongside .json since the Share
            // button (StyleTemplateCard.tsx / lib/styleTemplateShare.ts)
            // sends the identical JSON content as a .txt attachment — the
            // Web Share API's file-type whitelist doesn't include .json, so
            // a shared style template arrives as a .txt file.
            accept=".json,application/json,.txt,text/plain"
            className="hidden"
            onChange={(e) => handleImportFileChange(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-emerald-200 dark:ring-emerald-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FileDown className="w-5 h-5" />
            <span>{importing ? "Importing…" : "Import"}</span>
          </button>
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-action hover:bg-action-hover text-action-foreground px-5 py-2.5 rounded-xl font-medium shadow-md shadow-brand-200 dark:shadow-brand-900/40 transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-brand-700 dark:ring-brand-500"
          >
            <Plus className="w-5 h-5" />
            <span>Add Style Template</span>
          </button>
        </div>
      </div>

      {user && !loading && templates.length > 0 && <LibrarySearch value={query} onChange={(value) => { setQuery(value); setPage(1); }} label="Search style templates" count={totalItems} />}

      {!authLoading && !user ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl">
          <div className="w-12 h-12 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 rounded-xl flex items-center justify-center">
            <Palette className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Login to view your style templates</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Your style template library is tied to your account.
          </p>
          <button
            onClick={() => requireAuth()}
            className="mt-2 flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        </div>
      ) : loading ? (
        <CardGridSkeleton
          variant="panel"
          gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          count={PAGE_SIZE}
        />
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl">
          <div className="w-12 h-12 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 rounded-xl flex items-center justify-center">
            <Palette className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No style templates yet</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            {defaults.length > 0
              ? "Browse the Starter Templates above, or build your own from scratch."
              : "Add your first style template to start reusing it across projects."}
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {ASPECT_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setAspectFilter(opt.value);
                  setPage(1);
                }}
                aria-pressed={aspectFilter === opt.value}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  aspectFilter === opt.value
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-500/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl">
              <div className="w-12 h-12 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 rounded-xl flex items-center justify-center">
                <Palette className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No style templates match your filters</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">Try a different search or aspect ratio.</p>
              <button onClick={() => { setQuery(""); setAspectFilter("all"); setPage(1); }} className="mt-3 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-action-foreground hover:bg-action-hover">Reset filters</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {pageItems.map((template) => (
                  <StyleTemplateCard
                    key={template.id}
                    template={template}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                    onToggleDefault={handleToggleDefault}
                    togglingDefault={togglingDefaultId === template.id}
                    onShareError={(message) => setAlert({ title: "Share failed", message })}
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
            </>
          )}
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

      <DefaultStyleTemplateCardPopUp
        isOpen={defaultsPopupOpen}
        onClose={() => setDefaultsPopupOpen(false)}
        defaults={defaults}
        onImport={handleImportDefault}
        importingSlug={importingSlug}
        importedSlugs={importedSlugs}
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
