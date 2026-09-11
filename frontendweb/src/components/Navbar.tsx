"use client";

import { useDialogFocus } from "@/hooks/useDialogFocus";
import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { User, Menu, Sun, Moon, LogOut, UserCircle, ShieldCheck, ShieldQuestion } from "lucide-react";
import Logo from "./Logo";
import CreditCoinIcon from "./CreditCoinIcon";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/context/AuthContext";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

interface NavbarProps {
  onMenuClick?: () => void;
  mobileMenuOpen?: boolean;
}

export const Navbar = ({ onMenuClick, mobileMenuOpen = false }: NavbarProps) => {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut, openLoginModal, loading: authLoading, accessMode } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const accountDialogRef = useDialogFocus(isMenuOpen, () => setIsMenuOpen(false));
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const avatarUrl = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;

  const { balance } = useCreditBalance();

  useLayoutEffect(() => {
    if (!isMenuOpen || !avatarButtonRef.current) return;
    const rect = avatarButtonRef.current.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [isMenuOpen]);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await signOut();
    router.replace("/login");
  };

  return (
    <nav className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/70 px-4 shadow-sm shadow-slate-900/[.03] backdrop-blur-xl dark:border-white/[.07] dark:bg-background/95 dark:shadow-black/20 md:px-6">
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="studio-navigation"
          className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Logo />
      </div>
      
      <div className="hidden items-center gap-1 rounded-full border border-slate-200/80 bg-white/65 p-1 text-sm font-medium text-slate-600 shadow-sm dark:border-white/[.07] dark:bg-white/[.035] dark:text-slate-300 md:flex">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className="aria-[current=page]:bg-brand-100 aria-[current=page]:text-brand-800 dark:aria-[current=page]:bg-brand-400/15 dark:aria-[current=page]:text-brand-200 rounded-full px-4 py-1.5 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-400/10 dark:hover:text-brand-300">Home</Link>
        <Link href="/about" aria-current={pathname === "/about" ? "page" : undefined} className="aria-[current=page]:bg-brand-100 aria-[current=page]:text-brand-800 dark:aria-[current=page]:bg-brand-400/15 dark:aria-[current=page]:text-brand-200 rounded-full px-4 py-1.5 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-400/10 dark:hover:text-brand-300">About</Link>
        <Link href="/contact" aria-current={pathname === "/contact" ? "page" : undefined} className="aria-[current=page]:bg-brand-100 aria-[current=page]:text-brand-800 dark:aria-[current=page]:bg-brand-400/15 dark:aria-[current=page]:text-brand-200 rounded-full px-4 py-1.5 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-400/10 dark:hover:text-brand-300">Contact</Link>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        <button 
          onClick={toggleTheme}
          className="group relative cursor-pointer rounded-full border border-transparent p-2 text-slate-500 transition hover:border-slate-200 hover:bg-white hover:text-brand-700 hover:shadow-sm dark:text-slate-400 dark:hover:border-white/10 dark:hover:bg-white/[.06] dark:hover:text-brand-300"
          aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
        >
          {theme === "light" ? (
            <Moon className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" />
          ) : (
            <Sun className="w-5 h-5 text-amber-400 transition-transform duration-300 group-hover:rotate-45 group-hover:scale-110" />
          )}
        </button>

        {/* Only shown in the restrictive mode -- the default "allow all" mode
            needs no explanation, and showing this unconditionally would make
            the common case noisier for no reason. Gated on !authLoading so it
            doesn't flash the "not on the list" copy for a frame while the
            session is still resolving on first load (same reasoning as the
            authLoading branch just below). */}
        {!authLoading && accessMode === "allowed_only" && <AccessModeBadge allowed={Boolean(user)} />}

        {authLoading ? (
          /* AuthContext's initial getSession() hasn't resolved yet — `user`
             being null right now doesn't mean logged out, it means "don't
             know yet." Showing "Login" here (then swapping to the avatar a
             moment later on a hard refresh) is exactly the flash this avoids;
             matches the avatar button's own size so nothing shifts once the
             real state renders. */
          <div className="ml-2 flex items-center gap-2 animate-pulse" aria-hidden="true">
            <div className="hidden sm:block h-7 w-16 rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : !user ? (
          <button
            onClick={openLoginModal}
            className="ml-2 flex cursor-pointer items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-action-foreground shadow-sm transition hover:bg-action-hover active:scale-95"
          >
            Login
          </button>
        ) : (
        <>
          {balance !== null && (
            <Link
              href="/profile"
              className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/25 text-amber-800 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-500/15 transition-colors"
              title="Credit balance"
            >
              <CreditCoinIcon className="w-4 h-4" />
              {balance}
            </Link>
          )}

          <button
            ref={avatarButtonRef}
            onClick={() => setIsMenuOpen((open) => !open)}
            className="w-8 h-8 md:w-9 md:h-9 ml-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-medium shadow-sm hover:shadow transition-shadow cursor-pointer overflow-hidden"
            aria-label="Account menu"
            aria-expanded={isMenuOpen}
            aria-haspopup="dialog"
            aria-controls="account-menu"
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

          {isMenuOpen &&
            createPortal(
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                <div
                  ref={accountDialogRef}
                  id="account-menu"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Account menu"
                  tabIndex={-1}
                  className="fixed w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden"
                  style={{ top: menuPosition.top, right: menuPosition.right }}
                >
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {user?.user_metadata?.full_name ?? "Account"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {user?.email}
                    </p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
                  >
                    <UserCircle className="w-4 h-4" />
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </>,
              document.body
            )}
        </>
        )}
      </div>
    </nav>
  );
};

/**
 * Small invite-only indicator, shown only while access mode is
 * `allowed_only` (see useAuth().accessMode, sourced from the unauthenticated
 * GET /users/access_status). `allowed` is just `Boolean(user)` from the
 * caller: reaching this render signed-in at all means the backend already
 * let the sync-on-login call through (see access_control.py::enforce_access),
 * so a currently signed-in user is *by definition* on the allowed list --
 * there's no separate "check if I'm allowed" call to make.
 *
 * A signed-out visitor can't get the personalized version (their email isn't
 * known yet), so they get the neutral form instead; if they try to sign in
 * with a non-allowed email, AccessRevokedModal explains it after the fact.
 */
function AccessModeBadge({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span
      title="This app is currently invite-only, and your email is on the allowed list."
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-medium"
    >
      <ShieldCheck className="w-3.5 h-3.5" />
      Invite-only · You&apos;re allowed
    </span>
  ) : (
    <span
      title="Only emails on the allowed list can sign in right now."
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium"
    >
      <ShieldQuestion className="w-3.5 h-3.5" />
      Invite-only mode
    </span>
  );
}

export default Navbar;
