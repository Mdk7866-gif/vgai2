"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutTemplate, Sparkles, Heart, FolderKanban, LogIn, X } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "@/context/AuthContext";

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
    const { user, openLoginModal } = useAuth();

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
                        <div className="mx-1 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
                            <p className="text-[13px] text-slate-500 dark:text-slate-400">
                                No projects yet.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
