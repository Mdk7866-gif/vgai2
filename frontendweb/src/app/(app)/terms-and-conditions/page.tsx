import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms governing use of vgAI2 and its credit-based AI video creation tools.",
  alternates: { canonical: "/terms-and-conditions" },
};

const UPDATED = "September 15, 2026";

export default function TermsAndConditionsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-border dark:bg-surface sm:p-10"><p className="eyebrow">Legal</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">Terms &amp; Conditions</h1><p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Last updated: {UPDATED}</p></section>
      <article className="space-y-7 rounded-3xl border border-slate-200 bg-white p-7 text-sm leading-7 text-slate-600 dark:border-border dark:bg-surface dark:text-slate-300 sm:p-10">
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Using vgAI2</h2><p className="mt-2">vgAI2 provides tools to turn scripts into editable scenes and downloadable AI-generated media assets. You must use the service lawfully and provide accurate account information.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Your content and rights</h2><p className="mt-2">You are responsible for the scripts, prompts, images, characters, likenesses, and other materials you submit. You confirm that you have the rights and permissions needed to use them and that your use of generated output complies with applicable law and third-party provider rules.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Credits and payments</h2><p className="mt-2">Paid features use credits. Credit costs are displayed before generation starts. Payments are processed by Razorpay. Purchased credits do not expire and are non-refundable except where required by applicable law; see the Cancellation &amp; Refund Policy for details.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Acceptable use</h2><p className="mt-2">Do not use vgAI2 to violate law, infringe intellectual-property or privacy rights, impersonate others deceptively, distribute malware, bypass security controls, or create content that violates the rules of our providers.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Availability and changes</h2><p className="mt-2">The service and its AI providers can change, be interrupted, or become unavailable. We may update these terms or the product as it develops. Continued use after an updated effective date means you accept the revised terms.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Contact</h2><p className="mt-2">For questions about these terms, email <a className="font-medium text-brand-600 hover:underline dark:text-brand-300" href="mailto:hello@vgai2.com">hello@vgai2.com</a>.</p></section>
      </article>
    </div>
  );
}
