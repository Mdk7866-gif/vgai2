"use client";

import React from "react";
import { User, Menu, Sun, Moon } from "lucide-react";
import Logo from "./Logo";
import { useTheme } from "./ThemeProvider";
import Link from "next/link";

interface NavbarProps {
  onMenuClick?: () => void;
}

export const Navbar = ({ onMenuClick }: NavbarProps) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 shadow-sm shadow-slate-100/50 dark:shadow-slate-950/20">
      <div className="flex items-center gap-3 md:hidden">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Logo />
      </div>
      
      <div className="hidden md:flex items-center gap-6 text-[15px] font-medium text-slate-600 dark:text-slate-300">
        <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Home</Link>
        <Link href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">About</Link>
        <Link href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Contact</Link>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        <button 
          onClick={toggleTheme}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all relative group cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === "light" ? (
            <Moon className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" />
          ) : (
            <Sun className="w-5 h-5 text-amber-400 transition-transform duration-300 group-hover:rotate-45 group-hover:scale-110" />
          )}
        </button>

        <div className="w-8 h-8 md:w-9 md:h-9 ml-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-medium shadow-sm hover:shadow transition-shadow cursor-pointer">
          <User className="w-4 h-4 md:w-4 md:h-4" />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
