"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Users, LogIn, Sparkles, Library } from "lucide-react";
import CardGridSkeleton from "@/components/CardGridSkeleton";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api";
import type { Character, DefaultCharacter } from "@/types/character";
import CharacterCard from "@/components/characters/CharacterCard";
import DefaultCharacterCardPopUp from "@/components/characters/DefaultCharacterCardPopUp";
import EditCharacterCardPopUp, {
  CharacterFormValues,
} from "@/components/characters/EditCharacterCardPopUp";
import GenerateCharacterSheetPopUp from "@/components/characters/GenerateCharacterSheetPopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";

const PAGE_SIZE = 10;

// A character counts as "imported from this catalog entry" if these still
// match, which is how the "In library" badge survives a page reload without any
// separate DB column: nothing is persisted, it's re-derived from data already
// on both sides. It stops matching (and the card reverts to "Add to Library")
// the moment the user edits their copy, since it's then a genuinely different
// character — the correct behavior, not a bug.
//
// character_sheet_url is deliberately NOT one of these, unlike the style
// catalog's equivalent list: import makes a real Cloudinary copy into the
// user's own folder, so the URL is different by design on every import.
const IMPORT_MATCH_FIELDS = ["name", "description"] as const;

function matchesDefault(character: Character, def: DefaultCharacter): boolean {
  return IMPORT_MATCH_FIELDS.every((field) => (character[field] ?? null) === (def[field] ?? null));
}

export default function CharactersPage() {
  const { user, requireAuth, loading: authLoading } = useAuth();

  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const { page, setPage, pageCount, pageItems, totalItems } = usePagination(characters, PAGE_SIZE);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupMode, setPopupMode] = useState<"create" | "edit">("create");
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [popupKey, setPopupKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [generatePopupOpen, setGeneratePopupOpen] = useState(false);
  const [generatePopupKey, setGeneratePopupKey] = useState(0);

  // Starter catalog — public and independent of auth, so it loads once on
  // mount rather than alongside the user's own characters.
  const [defaults, setDefaults] = useState<DefaultCharacter[]>([]);
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [defaultsPopupOpen, setDefaultsPopupOpen] = useState(false);
  const [importingSlug, setImportingSlug] = useState<string | null>(null);
  // Derived from data, not tracked as its own state — see IMPORT_MATCH_FIELDS
  // above for why this survives a page reload without a dedicated DB column.
  const importedSlugs = useMemo(
    () => defaults.filter((def) => characters.some((c) => matchesDefault(c, def))).map((def) => def.slug),
    [defaults, characters]
  );

  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingDefaultId, setTogglingDefaultId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    // AuthContext's initial getSession() hasn't resolved yet — `user` being
    // null right now doesn't mean logged out, it means "don't know yet." Bail
    // without touching `characters`/`loading` so the page stays on its initial
    // loading state instead of flashing the logged-out view.
    if (authLoading) return;

    let cancelled = false;

    if (!user) {
      const timer = setTimeout(() => {
        setCharacters([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const startTimer = setTimeout(() => setLoading(true), 0);

    authFetch("/characters/")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCharacters(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setAlert({
            title: "Failed to load characters",
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

  // The catalog is public (GET /characters/defaults needs no token), so this
  // runs once on mount rather than keying off `user` like the effect above —
  // a signed-out visitor sees the starter library too.
  useEffect(() => {
    let cancelled = false;
    authFetch("/characters/defaults")
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

  const handleImportDefault = async (character: DefaultCharacter) => {
    if (!requireAuth()) return;
    setImportingSlug(character.slug);
    try {
      const res = await authFetch(`/characters/defaults/${character.slug}/import`, {
        method: "POST",
      });
      const created: Character = await res.json();
      // Imports are never auto-defaulted (see defaults.py), so unlike create/
      // update there's no other card's is_default to clear here.
      setCharacters((prev) => [created, ...prev]);
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

  const handleAddClick = () => {
    if (!requireAuth()) return;
    setPopupMode("create");
    setEditingCharacter(null);
    setPopupKey((k) => k + 1);
    setPopupOpen(true);
  };

  const handleGenerateClick = () => {
    if (!requireAuth()) return;
    setGeneratePopupKey((k) => k + 1);
    setGeneratePopupOpen(true);
  };

  const handleGenerated = (character: Character) => {
    setCharacters((prev) => [character, ...prev]);
    setPage(1);
    setGeneratePopupOpen(false);
  };

  const handleEditClick = (character: Character) => {
    if (!requireAuth()) return;
    setPopupMode("edit");
    setEditingCharacter(character);
    setPopupKey((k) => k + 1);
    setPopupOpen(true);
  };

  const handleDeleteClick = (character: Character) => {
    if (!requireAuth()) return;
    setDeleteTarget(character);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await authFetch(`/characters/delete/${target.id}`, { method: "DELETE" });
      setCharacters((prev) => prev.filter((c) => c.id !== target.id));
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

  const handleToggleDefault = async (character: Character) => {
    if (!requireAuth()) return;
    setTogglingDefaultId(character.id);
    try {
      const formData = new FormData();
      formData.append("name", character.name);
      formData.append("description", character.description);
      formData.append("is_default", String(!character.is_default));
      const res = await authFetch(`/characters/update/${character.id}`, {
        method: "PUT",
        body: formData,
      });
      const updated: Character = await res.json();
      setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      setAlert({
        title: "Failed to update default",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setTogglingDefaultId(null);
    }
  };

  const handleFormSubmit = async (values: CharacterFormValues) => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", values.name);
      formData.append("description", values.description);
      formData.append("is_default", String(values.isDefault));
      if (values.imageFile) formData.append("character_sheet", values.imageFile);

      if (popupMode === "create") {
        const res = await authFetch("/characters/create", { method: "POST", body: formData });
        const created: Character = await res.json();
        setCharacters((prev) => [created, ...prev]);
        // New items always land at the front — jump back to page 1 so the one
        // just created is actually visible instead of staying wherever paginated.
        setPage(1);
      } else if (editingCharacter) {
        const res = await authFetch(`/characters/update/${editingCharacter.id}`, {
          method: "PUT",
          body: formData,
        });
        const updated: Character = await res.json();
        setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
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
            Character Library
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-[15px] max-w-xl leading-relaxed">
            Save reusable characters with a consistent look, ready to import into any project.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Reserves the same slot/size whether the catalog is still loading,
              loaded with entries, or (rarely) empty/failed — swapping this in
              only once `defaults.length > 0` resolves would show the header row
              without this button and then pop it in a moment later, a CLS
              regression. Same treatment as the style-templates page. */}
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
                className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-violet-600 dark:text-violet-400 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-violet-200 dark:ring-violet-500/40"
              >
                <Library className="w-5 h-5" />
                <span>Starter Characters</span>
              </button>
            )
          )}
          <button
            onClick={handleGenerateClick}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-indigo-200 dark:ring-indigo-500/40"
          >
            <Sparkles className="w-5 h-5" />
            <span>Generate Character</span>
          </button>
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer ring-1 ring-indigo-700 dark:ring-indigo-500"
          >
            <Plus className="w-5 h-5" />
            <span>Add Character</span>
          </button>
        </div>
      </div>

      {!authLoading && !user ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Login to view your characters</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Your character library is tied to your account.
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
          variant="media"
          gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          count={PAGE_SIZE}
        />
      ) : characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No characters yet</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            {defaults.length > 0
              ? "Browse the Starter Characters above, or add your own from scratch."
              : "Add your first character to start reusing it across projects."}
          </p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {pageItems.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                onToggleDefault={handleToggleDefault}
                togglingDefault={togglingDefaultId === character.id}
              />
            ))}
          </div>
          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            itemLabel="characters"
            onChange={setPage}
          />
        </div>
      )}

      {/* Both remount counters start at 0, so the keys are namespaced per popup —
          two siblings keyed plain `0` collide in React's sibling reconciliation. */}
      <EditCharacterCardPopUp
        key={`edit-${popupKey}`}
        isOpen={popupOpen}
        onClose={() => setPopupOpen(false)}
        mode={popupMode}
        character={editingCharacter}
        onSubmit={handleFormSubmit}
        submitting={submitting}
      />

      <DefaultCharacterCardPopUp
        isOpen={defaultsPopupOpen}
        onClose={() => setDefaultsPopupOpen(false)}
        defaults={defaults}
        onImport={handleImportDefault}
        importingSlug={importingSlug}
        importedSlugs={importedSlugs}
      />

      <GenerateCharacterSheetPopUp
        key={`generate-${generatePopupKey}`}
        isOpen={generatePopupOpen}
        onClose={() => setGeneratePopupOpen(false)}
        onAccepted={handleGenerated}
      />

      <ConformationMessagePopUp
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Character"
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
