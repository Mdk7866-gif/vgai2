import React from "react";
import Link from "next/link";

const Footer = () => {
  return (
    <footer className="border-t border-slate-200/80 bg-white/55 px-6 py-3.5 text-center text-xs text-slate-500 backdrop-blur dark:border-white/[.07] dark:bg-slate-950/50 dark:text-slate-500">
      <div className="flex flex-col md:flex-row items-center justify-between">
        <span>&copy; {new Date().getFullYear()} vgAI. All rights reserved.</span>
        <div className="flex items-center gap-4 mt-2 md:mt-0">
          <Link href="/contact" className="transition-colors hover:text-brand-600 dark:hover:text-brand-300">Support</Link>
          <Link href="/about" className="transition-colors hover:text-brand-600 dark:hover:text-brand-300">About</Link>
          <Link href="/privacy-policy" className="transition-colors hover:text-brand-600 dark:hover:text-brand-300">Privacy</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
