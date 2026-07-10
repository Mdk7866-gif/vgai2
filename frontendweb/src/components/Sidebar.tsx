"use client";

import React from "react";
import { FolderKanban, Users, LayoutTemplate, Settings, Clapperboard, Video, X } from "lucide-react";
import Logo from "./Logo";

interface SidebarProps {
    onClose?: () => void;
}

export const Sidebar = ({ onClose }: SidebarProps) => {
    const menuItems = [
        { icon: FolderKanban, label: "Projects", active: true },
        { icon: Video, label: "Scenes" },
        { icon: Users, label: "Characters" },
        { icon: Clapperboard, label: "Generations" },
        { icon: LayoutTemplate, label: "Templates" },
    ];

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

            <div className="flex-1 py-6 px-4 flex flex-col gap-1 overflow-y-auto scrollbar-hide">
                <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-3">
                    Overview
                </div>
                {menuItems.map((item, idx) => (
                    <button
                        key={idx}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group cursor-pointer ${item.active
                            ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium ring-1 ring-indigo-100 dark:ring-indigo-500/30"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                    >
                        <item.icon className={`w-[18px] h-[18px] ${item.active ? "text-indigo-600 dark:text-indigo-300" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors"}`} />
                        <span className="text-[14px]">{item.label}</span>
                    </button>
                ))}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-[14px] cursor-pointer">
                    <Settings className="w-[18px] h-[18px] text-slate-400 dark:text-slate-500" />
                    <span className="font-medium">Settings</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
