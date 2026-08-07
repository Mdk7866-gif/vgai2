"use client";

import React, { useEffect, useState } from "react";
import { Plus, Loader2, Users, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api";
import type { Character } from "@/types/character";
import CharacterCard from "@/components/characters/CharacterCard";
import EditCharacterCardPopUp, {
  CharacterFormValues,
} from "@/components/characters/EditCharacterCardPopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";

export default function CharactersPage() {
  const { user, requireAuth } = useAuth();

  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupMode, setPopupMode] = useState<"create" | "edit">("create");
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [popupKey, setPopupKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingDefaultId, setTogglingDefaultId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
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
  }, [user]);

  const handleAddClick = () => {
    if (!requireAuth()) return;
    setPopupMode("create");
    setEditingCharacter(null);
    setPopupKey((k) => k + 1);
    setPopupOpen(true);
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
        <button
          onClick={handleAddClick}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 w-full sm:w-auto justify-center cursor-pointer ring-1 ring-indigo-700 dark:ring-indigo-500"
        >
          <Plus className="w-5 h-5" />
          <span>Add Character</span>
        </button>
      </div>

      {!user ? (
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
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No characters yet</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Add your first character to start reusing it across projects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {characters.map((character) => (
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
      )}

      <EditCharacterCardPopUp
        key={popupKey}
        isOpen={popupOpen}
        onClose={() => setPopupOpen(false)}
        mode={popupMode}
        character={editingCharacter}
        onSubmit={handleFormSubmit}
        submitting={submitting}
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
