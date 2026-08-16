"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, Loader2, Check, Users, Trash2, Pencil } from "lucide-react";
import { authFetch } from "@/lib/api";
import type { Character } from "@/types/character";
import type { ProjectCharacter } from "@/types/project";
import EditCharacterCardPopUp, { CharacterFormValues } from "@/components/characters/EditCharacterCardPopUp";

interface ChooseCharacterPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  importedCharacters: ProjectCharacter[];
  onImported: (characters: ProjectCharacter[]) => void;
  onRemoved: (projectCharacterId: string) => void;
  /** Fired after PUT /projects/{id}/characters/{id} edits one project-local
   * character snapshot — see EditCharacterCardPopUp's "project" scope below.
   * Kept separate from onImported (which replaces the whole imported list)
   * since an edit only ever touches one row. */
  onCharacterUpdated: (updated: ProjectCharacter) => void;
}

export const ChooseCharacterPopUp = ({
  isOpen,
  onClose,
  projectId,
  importedCharacters,
  onImported,
  onRemoved,
  onCharacterUpdated,
}: ChooseCharacterPopUpProps) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingSnapshot, setEditingSnapshot] = useState<ProjectCharacter | null>(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const startTimer = setTimeout(() => setLoading(true), 0);
    authFetch("/characters/")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCharacters(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load characters.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
  }, [isOpen]);

  const importedNames = useMemo(
    () => new Set(importedCharacters.map((c) => c.snapshot_name.trim().toLowerCase())),
    [importedCharacters]
  );

  const availableCharacters = useMemo(
    () => characters.filter((c) => !importedNames.has(c.name.trim().toLowerCase())),
    [characters, importedNames]
  );

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/${projectId}/characters/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_ids: Array.from(selected) }),
      });
      const data: ProjectCharacter[] = await res.json();
      onImported(data);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import characters.");
    } finally {
      setImporting(false);
    }
  };

  const handleRemove = async (projectCharacterId: string) => {
    setRemovingId(projectCharacterId);
    setError(null);
    try {
      await authFetch(`/projects/${projectId}/characters/${projectCharacterId}`, { method: "DELETE" });
      onRemoved(projectCharacterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove character.");
    } finally {
      setRemovingId(null);
    }
  };

  // Edits this project's own project_characters row via
  // EditCharacterCardPopUp.tsx's "project" scope — multipart like the
  // library's own update endpoint, since an image replacement is optional
  // here too. Never touches /characters, so the original library character
  // (or any other project that imported it) is unaffected.
  const handleSnapshotSubmit = async (values: CharacterFormValues) => {
    if (!editingSnapshot) return;
    setSavingSnapshot(true);
    try {
      const body = new FormData();
      body.append("name", values.name);
      body.append("description", values.description);
      if (values.imageFile) body.append("character_sheet", values.imageFile);
      const res = await authFetch(`/projects/${projectId}/characters/${editingSnapshot.id}`, {
        method: "PUT",
        body,
      });
      const updated: ProjectCharacter = await res.json();
      onCharacterUpdated(updated);
      setEditingSnapshot(null);
    } finally {
      setSavingSnapshot(false);
    }
  };

  if (!isOpen) return null;

  // A synthetic Character built from the project_characters snapshot being
  // edited — EditCharacterCardPopUp only ever reads character.<field> to
  // seed the form (never id/user_id/is_default meaningfully in "project"
  // scope, where the default toggle is hidden), so placeholder values there
  // are safe.
  const editingAsCharacter: Character | null = editingSnapshot
    ? {
        id: editingSnapshot.id,
        user_id: "",
        is_default: false,
        name: editingSnapshot.snapshot_name,
        description: editingSnapshot.snapshot_description,
        character_sheet_url: editingSnapshot.snapshot_character_sheet_url,
        created_at: editingSnapshot.created_at,
        updated_at: editingSnapshot.updated_at,
      }
    : null;

  return (
    <>
      {createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg lg:max-w-3xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Characters</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-6">
          {importedCharacters.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5">
                Imported to this project
              </h3>
              <div className="flex flex-wrap gap-2">
                {importedCharacters.map((c) => (
                  <span
                    key={c.id}
                    className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-[13px] text-indigo-700 dark:text-indigo-300"
                  >
                    <button
                      type="button"
                      onClick={() => setEditingSnapshot(c)}
                      aria-label={`View or edit ${c.snapshot_name} for this project`}
                      className="relative w-5 h-5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0 cursor-pointer"
                    >
                      <Image src={c.snapshot_character_sheet_url} alt={c.snapshot_name} fill unoptimized className="object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSnapshot(c)}
                      className="hover:underline cursor-pointer"
                    >
                      {c.snapshot_name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSnapshot(c)}
                      aria-label={`Edit ${c.snapshot_name} for this project`}
                      className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRemove(c.id)}
                      disabled={removingId === c.id}
                      aria-label={`Remove ${c.snapshot_name}`}
                      className="text-indigo-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer disabled:opacity-60"
                    >
                      {removingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5">
              Your Character Library
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              </div>
            ) : availableCharacters.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 py-10 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                <Users className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {characters.length === 0 ? "No characters in your library yet." : "All your characters are already imported."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableCharacters.map((c) => {
                  const isSelected = selected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleSelected(c.id)}
                      className={`relative text-left rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                        isSelected
                          ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-500/30"
                          : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50"
                      }`}
                    >
                      <div className="relative w-full aspect-video bg-slate-100 dark:bg-slate-900">
                        <Image src={c.character_sheet_url} alt={c.name} fill unoptimized className="object-cover" />
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <div className="px-2.5 py-2 bg-white dark:bg-slate-800/70">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {error && <p className="px-6 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-2 px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handleImport}
            disabled={importing || selected.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
            Import {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>,
        document.body
      )}

      <EditCharacterCardPopUp
        key={editingSnapshot ? `snapshot-${editingSnapshot.id}` : "snapshot-closed"}
        isOpen={!!editingSnapshot}
        onClose={() => !savingSnapshot && setEditingSnapshot(null)}
        mode="edit"
        scope="project"
        character={editingAsCharacter}
        onSubmit={handleSnapshotSubmit}
        submitting={savingSnapshot}
      />
    </>
  );
};

export default ChooseCharacterPopUp;
