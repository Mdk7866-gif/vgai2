"use client";

import React, { useState } from "react";
import { User, Menu, Sun, Moon, LogOut } from "lucide-react";
import Logo from "./Logo";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface NavbarProps {
  onMenuClick?: () => void;
}

export const Navbar = ({ onMenuClick }: NavbarProps) => {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut, openLoginModal } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarUrl = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await signOut();
    router.replace("/login");
  };

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
        <Link href="/about" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">About</Link>
        <Link href="/contact" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Contact</Link>
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

        {!user ? (
          <button
            onClick={openLoginModal}
            className="ml-2 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            Login
          </button>
        ) : (
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen((open) => !open)}
            className="w-8 h-8 md:w-9 md:h-9 ml-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-medium shadow-sm hover:shadow transition-shadow cursor-pointer overflow-hidden"
            aria-label="Account menu"
          >
            {avatarUrl && !avatarFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={user.user_metadata?.full_name ?? "Account"}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 md:w-4 md:h-4" />
            )}
          </button>

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {user?.user_metadata?.full_name ?? "Account"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {user?.email}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
