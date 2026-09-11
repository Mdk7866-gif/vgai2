"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, LayoutTemplate, Sparkles, Heart, FolderKanban, Folder, House, Pencil, LogIn, X, Plus, Trash2, Check, Loader2 } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "@/context/AuthContext";
import { useProjects, type ProjectListItem } from "@/context/ProjectsContext";
import ConformationMessagePopUp from "./ConformationMessagePopUp";
import AlertMessagePopUp from "./AlertMessagePopUp";

const formatCreatedDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// Double-click-to-rename overloads the single click that normally navigates --
// a double click fires two click events, so navigation is delayed briefly and
// cancelled if a second click lands in time instead of firing immediately.
const NAVIGATE_DELAY_MS = 220;

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
    const { projects, loading, createProject, renameProject, removeProject, toggleLike } = useProjects();

    const [newProjectName, setNewProjectName] = useState("");
    const [creating, setCreating] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [renaming, setRenaming] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [likingId, setLikingId] = useState<string | null>(null);

    const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

    const navigateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const startEditing = (project: { id: string; name: string }) => {
        setEditingId(project.id);
        setEditingName(project.name);
    };

    const saveRename = async (id: string) => {
        const name = editingName.trim();
        if (!name) {
            setEditingId(null);
            return;
        }
        setRenaming(true);
        try {
            await renameProject(id, name);
            setEditingId(null);
        } catch (err) {
            setAlert({ title: "Failed to rename project", message: err instanceof Error ? err.message : "Something went wrong." });
        } finally {
            setRenaming(false);
        }
    };

    const handleNameClick = (project: ProjectListItem) => {
        if (navigateTimer.current) return;
        navigateTimer.current = setTimeout(() => {
            router.push(`/project_folder/${project.id}`);
            onClose?.();
            navigateTimer.current = null;
        }, NAVIGATE_DELAY_MS);
    };

    const handleNameDoubleClick = (project: ProjectListItem) => {
        if (navigateTimer.current) {
            clearTimeout(navigateTimer.current);
            navigateTimer.current = null;
        }
        startEditing(project);
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
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-3">
                        <FolderKanban className="w-3.5 h-3.5" />
                        Project Folders
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
                                        const isEditing = editingId === project.id;
                                        return (
                                            <div
                                                key={project.id}
                                                title={`Created ${formatCreatedDate(project.created_at)}`}
                                                className={`group flex items-center gap-1 px-2 py-1.5 rounded-xl transition-all ${active
                                                    ? "bg-brand-50 dark:bg-brand-500/15 ring-1 ring-brand-100 dark:ring-brand-500/30"
                                                    : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
                                                    }`}
                                            >
                                                {isEditing ? (
                                                    <>
                                                        <input
                                                            autoFocus
                                                            value={editingName}
                                                            onChange={(e) => setEditingName(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") saveRename(project.id);
                                                                if (e.key === "Escape") setEditingId(null);
                                                            }}
                                                            onBlur={() => saveRename(project.id)}
                                                            disabled={renaming}
                                                            aria-label="Project name"
                                                            className="flex-1 min-w-0 px-2 py-1 text-[13px] rounded-lg border border-brand-300 dark:border-brand-500/50 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                                                        />
                                                        <button
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            aria-label="Save project name"
                                                            onClick={() => saveRename(project.id)}
                                                            disabled={renaming}
                                                            className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg cursor-pointer disabled:opacity-60"
                                                        >
                                                            {renaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Folder className="w-3.5 h-3.5 flex-shrink-0 text-amber-500 fill-amber-400/70" />
                                                        <button
                                                            type="button"
                                                            aria-current={active ? "page" : undefined}
                                                            onClick={() => handleNameClick(project)}
                                                            onDoubleClick={() => handleNameDoubleClick(project)}
                                                            className={`flex-1 min-w-0 px-1 py-1 text-[13.5px] text-left truncate cursor-pointer select-none ${active
                                                                ? "text-brand-700 dark:text-brand-300 font-medium"
                                                                : "text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100"
                                                                }`}
                                                        >
                                                            {project.name}
                                                        </button>
                                                        <button type="button" onClick={() => startEditing(project)} aria-label={`Rename ${project.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"><Pencil className="h-3.5 w-3.5" /></button>
                                                        <button
                                                            onClick={() => handleToggleLike(project)}
                                                            disabled={likingId === project.id}
                                                            aria-label={project.is_liked ? `Unlike ${project.name}` : `Like ${project.name}`}
                                                            className={`p-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-60 ${project.is_liked
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
                                                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
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
