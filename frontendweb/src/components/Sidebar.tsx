"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, LayoutTemplate, Sparkles, Heart, FolderKanban, Folder, House, LogIn, X, Plus, Trash2, CheckSquare, Square, Loader2 } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "@/context/AuthContext";
import { useProjects, type ProjectListItem } from "@/context/ProjectsContext";
import ConformationMessagePopUp from "./ConformationMessagePopUp";
import AlertMessagePopUp from "./AlertMessagePopUp";

const formatCreatedDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

interface SidebarProps {
    onClose?: () => void;
}

const libraryItems = [
    { icon: House, label: "Overview", href: "/" },
    { icon: Users, label: "Characters", href: "/characters" },
    { icon: LayoutTemplate, label: "Style Templates", href: "/style_templates" },
    { icon: Sparkles, label: "Generate Scripts", href: "/generate_script" },
    { icon: Heart, label: "Liked Projects", href: "/liked_projects" },
];

export const Sidebar = ({ onClose }: SidebarProps) => {
    const pathname = usePathname();
    const router = useRouter();
    const { user, openLoginModal, requireAuth, loading: authLoading } = useAuth();
    const { projects, loading, createProject, removeProject, removeProjects, toggleLike } = useProjects();

    const [newProjectName, setNewProjectName] = useState("");
    const [creating, setCreating] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [selectingProjects, setSelectingProjects] = useState(false);
    const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    const [likingId, setLikingId] = useState<string | null>(null);

    const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

    const handleCreate = async () => {
        if (!requireAuth()) return;
        const name = newProjectName.trim();
        if (!name) return;
        setCreating(true);
        try {
            const created = await createProject(name);
            setNewProjectName("");
            router.push(`/project_folder/${created.id}`);
            onClose?.();
        } catch (err) {
            setAlert({ title: "Failed to create project", message: err instanceof Error ? err.message : "Something went wrong." });
        } finally {
            setCreating(false);
        }
    };

    const toggleProjectSelection = (projectId: string) => {
        setSelectedProjectIds((current) =>
            current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]
        );
    };

    const exitProjectSelection = () => {
        setSelectingProjects(false);
        setSelectedProjectIds([]);
    };

    const handleToggleLike = async (project: ProjectListItem) => {
        if (!requireAuth()) return;
        setLikingId(project.id);
        try {
            await toggleLike(project.id, !project.is_liked);
        } catch (err) {
            setAlert({ title: "Failed to update like", message: err instanceof Error ? err.message : "Something went wrong." });
        } finally {
            setLikingId(null);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setDeleting(true);
        try {
            await removeProject(target.id);
            if (pathname === `/project_folder/${target.id}`) {
                router.push("/");
            }
        } catch (err) {
            setAlert({ title: "Failed to delete project", message: err instanceof Error ? err.message : "Something went wrong." });
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    const confirmBulkDelete = async () => {
        const ids = selectedProjectIds;
        if (ids.length === 0) return;
        setBulkDeleting(true);
        try {
            await removeProjects(ids);
            if (ids.some((id) => pathname === `/project_folder/${id}`)) {
                router.push("/");
            }
            setBulkDeleteOpen(false);
            exitProjectSelection();
        } catch (err) {
            setAlert({ title: "Failed to delete projects", message: err instanceof Error ? err.message : "Something went wrong." });
        } finally {
            setBulkDeleting(false);
        }
    };

    return (
        <aside className="w-[280px] md:w-64 lg:w-72 border-r border-slate-200/80 dark:border-white/[.07] bg-white/90 dark:bg-background flex flex-col h-full shadow-2xl md:shadow-none transition-colors duration-200">
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
                <Logo />
                <button
                    onClick={onClose}
                    aria-label="Close menu"
                    className="md:hidden p-2 -mr-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 py-6 px-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide">
                {/* Library */}
                <div>
                    <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-3">
                        Your studio
                    </div>
                    <div className="flex flex-col gap-1">
                        {libraryItems.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    onClick={onClose}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${active
                                        ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 font-medium ring-1 ring-brand-100 dark:ring-brand-500/30"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100"
                                        }`}
                                >
                                    <item.icon className={`w-[18px] h-[18px] ${active ? "text-brand-600 dark:text-brand-300" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors"}`} />
                                    <span className="text-[14px]">{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* Project Folders */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-3">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="w-3.5 h-3.5" />
                        Project Folders
                      </div>
                      {user && projects.length > 0 && (
                        <button
                          type="button"
                          onClick={() => selectingProjects ? exitProjectSelection() : setSelectingProjects(true)}
                          className="normal-case text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer"
                        >
                          {selectingProjects ? "Cancel" : "Select"}
                        </button>
                      )}
                    </div>

                    {authLoading ? (
                        /* AuthContext's initial getSession() hasn't resolved yet — `user`
                           being null right now doesn't mean logged out, it means "don't
                           know yet." Showing the login prompt here (then swapping to the
                           real project list a moment later on a hard refresh) is exactly
                           the flash this avoids. */
                        <div className="flex flex-col gap-1.5 px-1" aria-hidden="true">
                            {[0, 1, 2].map((i) => (
                                <div
                                    key={i}
                                    className="h-9 rounded-xl bg-slate-100 dark:bg-surface animate-pulse"
                                />
                            ))}
                        </div>
                    ) : !user ? (
                        <div className="mx-1 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
                            <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                Login first to see or create your projects.
                            </p>
                            <button
                                onClick={openLoginModal}
                                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer"
                            >
                                <LogIn className="w-3.5 h-3.5" />
                                Login
                            </button>
                        </div>
                    ) : (
                        <>
                            {selectingProjects && (
                              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/70 dark:bg-brand-500/10 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProjectIds(selectedProjectIds.length === projects.length ? [] : projects.map((project) => project.id))}
                                  className="text-[12px] font-medium text-brand-700 dark:text-brand-300 hover:underline cursor-pointer"
                                >
                                  {selectedProjectIds.length === projects.length ? "Clear all" : "Select all"}
                                </button>
                                <button
                                  type="button"
                                  disabled={selectedProjectIds.length === 0}
                                  onClick={() => setBulkDeleteOpen(true)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-[12px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete ({selectedProjectIds.length})
                                </button>
                              </div>
                            )}
                            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col gap-1 mb-3">
                                {loading ? (
                                    <div className="flex items-center justify-center py-6">
                                        <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                                    </div>
                                ) : projects.length === 0 ? (
                                    <div className="mx-1 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
                                        <p className="text-[13px] text-slate-500 dark:text-slate-400">No projects yet.</p>
                                    </div>
                                ) : (
                                    projects.map((project) => {
                                        const active = pathname === `/project_folder/${project.id}`;
                                        const isSelected = selectedProjectIds.includes(project.id);
                                        return (
                                            <div
                                                key={project.id}
                                                title={`${project.name} — created ${formatCreatedDate(project.created_at)}`}
                                                className={`group flex items-center gap-1 px-2 py-1.5 rounded-xl transition ${active
                                                    ? "bg-brand-50 dark:bg-brand-500/15 ring-1 ring-brand-100 dark:ring-brand-500/30"
                                                    : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
                                                    }`}
                                            >
                                                {selectingProjects ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleProjectSelection(project.id)}
                                                        aria-pressed={isSelected}
                                                        aria-label={`${isSelected ? "Deselect" : "Select"} ${project.name}`}
                                                        className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left cursor-pointer"
                                                    >
                                                        {isSelected ? <CheckSquare className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" /> : <Square className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}
                                                        <Folder className="w-3.5 h-3.5 flex-shrink-0 text-amber-500 fill-amber-400/70" />
                                                        <span className="min-w-0 truncate text-[13.5px] text-slate-700 dark:text-slate-300">{project.name}</span>
                                                    </button>
                                                ) : (
                                                    <>
                                                        <Folder className="w-3.5 h-3.5 flex-shrink-0 text-amber-500 fill-amber-400/70" />
                                                        <button
                                                            type="button"
                                                            aria-current={active ? "page" : undefined}
                                                            onClick={() => { router.push(`/project_folder/${project.id}`); onClose?.(); }}
                                                            className={`flex-1 min-w-0 px-1 py-1 text-[13.5px] text-left truncate cursor-pointer select-none ${active
                                                                ? "text-brand-700 dark:text-brand-300 font-medium"
                                                                : "text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100"
                                                                }`}
                                                        >
                                                            {project.name}
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleLike(project)}
                                                            disabled={likingId === project.id}
                                                            aria-label={project.is_liked ? `Unlike ${project.name}` : `Like ${project.name}`}
                                                            className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-60 ${project.is_liked
                                                                ? "text-red-500 hover:text-red-600"
                                                                : "text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-800"
                                                                }`}
                                                        >
                                                            {likingId === project.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <Heart className={`w-3.5 h-3.5 ${project.is_liked ? "fill-current" : ""}`} />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteTarget(project)}
                                                            aria-label={`Delete ${project.name}`}
                                                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 px-1">
                                <input
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                                    placeholder="New project name"
                                    aria-label="New project name"
                                    className="flex-1 min-w-0 px-3 py-2 text-[13px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 transition-all"
                                />
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !newProjectName.trim()}
                                    className="flex items-center gap-1 px-3 py-2 text-[13px] font-medium text-action-foreground bg-action hover:bg-action-hover rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                                >
                                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    Create
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <ConformationMessagePopUp
                isOpen={!!deleteTarget}
                onClose={() => !deleting && setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title="Delete Project"
                message={`Are you sure you want to delete "${deleteTarget?.name}"? This will permanently delete its scenes, imported characters, and generated media. This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                isDestructive
                confirming={deleting}
            />

            <ConformationMessagePopUp
                isOpen={bulkDeleteOpen}
                onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
                onConfirm={confirmBulkDelete}
                title={`Delete ${selectedProjectIds.length} Projects`}
                message={`Are you sure you want to permanently delete ${selectedProjectIds.length} selected project folder${selectedProjectIds.length === 1 ? "" : "s"}? Their scenes, imported characters, and generated media will be deleted. This action cannot be undone.`}
                confirmText={`Delete ${selectedProjectIds.length} Projects`}
                cancelText="Cancel"
                isDestructive
                confirming={bulkDeleting}
            />

            <AlertMessagePopUp
                isOpen={!!alert}
                onClose={() => setAlert(null)}
                title={alert?.title ?? ""}
                message={alert?.message ?? ""}
                type="error"
            />
        </aside>
    );
};

export default Sidebar;
