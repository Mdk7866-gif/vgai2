"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { LifeBuoy, ImagePlus, X, Loader2, CheckCircle2, Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";

// Mirrors the backend's own limits (app/routes/contact/crud.py), which in turn
// mirror the column widths in migration/001_contact_submissions.sql.
const NAME_MAX = 200;
const CONTACT_MAX = 320;
const DESCRIPTION_MAX = 5000;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 transition";

const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";

export default function ContactPage() {
  const { user } = useAuth();

  // Prefilled from the session when there is one, but always editable — the
  // form is usable signed-out, and a user reporting "I can't sign in" may well
  // need to give a different address than the one that isn't working.
  const [name, setName] = useState(user?.user_metadata?.full_name ?? "");
  const [contact, setContact] = useState(user?.email ?? "");
  const [issueDescription, setIssueDescription] = useState("");

  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAlert({ title: "Not an image", message: "Please choose an image file for the screenshot." });
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setAlert({ title: "Image too large", message: "The screenshot must be 10 MB or smaller." });
      return;
    }
    // Revoke the previous object URL before replacing it, so swapping the
    // picked file repeatedly doesn't leak blobs for the page's lifetime.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setScreenshot(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearScreenshot = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setScreenshot(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim() || !issueDescription.trim()) {
      setAlert({
        title: "Missing details",
        message: "Please fill in your name, contact, and a description of the issue.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("contact", contact.trim());
      formData.append("issue_description", issueDescription.trim());
      if (screenshot) formData.append("screenshot", screenshot);

      // authFetch, not plain fetch: the endpoint takes no token, but attaching
      // one when a session exists is what lets the submission be attributed to
      // the signed-in account. A signed-out submit simply sends no header.
      await authFetch("/contact/submit", { method: "POST", body: formData });

      clearScreenshot();
      setSubmitted(true);
    } catch (err) {
      setAlert({
        title: "Couldn't send your message",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 py-24 animate-in fade-in duration-500">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Message sent
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-md text-[15px] leading-relaxed">
          Thanks — we&apos;ve received your message and will get back to you at{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">{contact}</span>.
        </p>
        <button
          onClick={() => {
            setIssueDescription("");
            setSubmitted(false);
          }}
          className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-8 pb-16 animate-in fade-in duration-500">
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-border dark:bg-surface sm:p-8">
        <p className="eyebrow mb-4">We’re here to help</p>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 flex-shrink-0 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Contact Us
          </h1>
        </div>
        <p className="mt-3 text-slate-500 dark:text-slate-400 text-[15px] leading-relaxed">
          Run into a problem, or need a hand with something? Tell us what happened and we&apos;ll
          get back to you. A screenshot helps a lot, but it&apos;s optional.
        </p>
      </div>

      <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">No login required. Please don’t include passwords, API keys, or payment card details.</p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-3xl p-6 sm:p-8"
      >
        <div>
          <label htmlFor="contact-name" className={labelClass}>
            Your name
          </label>
          <input
            id="contact-name"
            autoComplete="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="e.g. Ayaan Rahman"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="contact-detail" className={labelClass}>
            Email or mobile number
          </label>
          <input
            id="contact-detail"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={CONTACT_MAX}
            placeholder="Where should we reply?"
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Either works — whichever is easiest for you to reach.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="contact-issue" className={labelClass}>
              What went wrong?
            </label>
            <span className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
              {issueDescription.length}/{DESCRIPTION_MAX}
            </span>
          </div>
          <textarea
            id="contact-issue"
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={7}
            placeholder="Describe the issue — what you were doing, what you expected, and what happened instead."
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className={labelClass}>
            Screenshot
            <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">(optional)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          {previewUrl ? (
            <div className="relative w-full max-w-xs aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
              <Image src={previewUrl} alt="Screenshot preview" fill unoptimized className="object-contain" />
              <button
                type="button"
                onClick={clearScreenshot}
                aria-label="Remove screenshot"
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 hover:border-brand-400 hover:text-brand-500 transition cursor-pointer text-sm font-medium"
            >
              <ImagePlus className="w-4 h-4" />
              Attach a screenshot
            </button>
          )}
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Images only, up to 10 MB.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 flex items-center justify-center gap-2 w-full sm:w-auto sm:self-start bg-action hover:bg-action-hover text-action-foreground px-6 py-2.5 rounded-xl font-medium shadow-md shadow-brand-200 dark:shadow-brand-900/40 transition active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? "Sending…" : "Send message"}
        </button>
      </form>

      <AlertMessagePopUp
        isOpen={!!alert}
        onClose={() => setAlert(null)}
        title={alert?.title ?? ""}
        message={alert?.message ?? ""}
        type="error"
      />
    </div>
  );
}
