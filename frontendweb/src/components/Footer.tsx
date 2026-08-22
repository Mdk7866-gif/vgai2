import React from "react";
import Link from "next/link";

const Footer = () => {
  return (
    <footer className="border-t border-zinc-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-4 px-6 text-center text-sm text-zinc-500 dark:text-slate-400">
      <div className="flex flex-col md:flex-row items-center justify-between">
        <span>&copy; {new Date().getFullYear()} vgAI. All rights reserved.</span>
        <div className="flex items-center gap-4 mt-2 md:mt-0">
          <a href="#" className="hover:text-purple-500 dark:hover:text-purple-400 transition-colors">Documentation</a>
          <a href="#" className="hover:text-purple-500 dark:hover:text-purple-400 transition-colors">Support</a>
          <Link href="/privacy-policy" className="hover:text-purple-500 dark:hover:text-purple-400 transition-colors">Privacy Policy</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
