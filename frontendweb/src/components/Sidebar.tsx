"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, LayoutTemplate, Sparkles, Heart, FolderKanban, LogIn, X, Plus, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "@/context/AuthContext";
import { useProjects } from "@/context/ProjectsContext";
import ConformationMessagePopUp from "./ConformationMessagePopUp";
import AlertMessagePopUp from "./AlertMessagePopUp";

interface SidebarProps {
    onClose?: () => void;
}

const libraryItems = [
    { icon: Users, label: "Characters", href: "/characters" },
    { icon: LayoutTemplate, label: "Style Templates", href: "/style_templates" },
    { icon: Sparkles, label: "Generate Scripts", href: "/generate_script" },
    { icon: Heart, label: "Liked Projects", href: "/liked_projects" },
];

export const Sidebar = ({ onClose }: SidebarProps) => {
    const pathname = usePathname();
    const router = useRouter();
    const { user, openLoginModal, requireAuth } = useAuth();
    const { projects, loading, createProject, renameProject, removeProject } = useProjects();

    const [newProjectName, setNewProjectName] = useState("");
    const [creating, setCreating] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [renaming, setRenaming] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

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
        <aside className="w-[280px] md:w-72 lg:w-80 border-r border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 flex flex-col h-full shadow-2xl md:shadow-none transition-colors duration-200">
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
                <Logo />
                <button
                    onClick={onClose}
                    className="md:hidden p-2 -mr-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 py-6 px-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide">
                {/* Library */}
                <div>
                    <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-3">
                        Library
                    </div>
                    <div className="flex flex-col gap-1">
                        {libraryItems.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${active
                                        ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium ring-1 ring-indigo-100 dark:ring-indigo-500/30"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100"
                                        }`}
                                >
                                    <item.icon className={`w-[18px] h-[18px] ${active ? "text-indigo-600 dark:text-indigo-300" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors"}`} />
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

                    {!user ? (
                        <div className="mx-1 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
                            <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                Login first to see or create your projects.
                            </p>
                            <button
                                onClick={openLoginModal}
                                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
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
                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
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
                                                className={`group flex items-center gap-1 px-2 py-1.5 rounded-xl transition-all ${active
                                                    ? "bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-100 dark:ring-indigo-500/30"
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
                                                            className="flex-1 min-w-0 px-2 py-1 text-[13px] rounded-lg border border-indigo-300 dark:border-indigo-500/50 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                                                        />
                                                        <button
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onClick={() => saveRename(project.id)}
                                                            disabled={renaming}
                                                            className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg cursor-pointer disabled:opacity-60"
                                                        >
                                                            {renaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Link
                                                            href={`/project_folder/${project.id}`}
                                                            onClick={onClose}
                                                            className={`flex-1 min-w-0 px-1 py-1 text-[13.5px] truncate ${active
                                                                ? "text-indigo-700 dark:text-indigo-300 font-medium"
                                                                : "text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100"
                                                                }`}
                                                        >
                                                            {project.name}
                                                        </Link>
                                                        <button
                                                            onClick={() => startEditing(project)}
                                                            aria-label={`Rename ${project.name}`}
                                                            className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteTarget(project)}
                                                            aria-label={`Delete ${project.name}`}
                                                            className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
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
                                    className="flex-1 min-w-0 px-3 py-2 text-[13px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all"
                                />
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !newProjectName.trim()}
                                    className="flex items-center gap-1 px-3 py-2 text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
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
