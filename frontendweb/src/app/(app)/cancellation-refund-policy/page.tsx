import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description: "vgAI2 policy for credit purchases, cancellations, and refunds.",
  alternates: { canonical: "/cancellation-refund-policy" },
};

const UPDATED = "September 15, 2026";

export default function CancellationRefundPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-border dark:bg-surface sm:p-10"><p className="eyebrow">Legal</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">Cancellation &amp; Refund Policy</h1><p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Last updated: {UPDATED}</p></section>
      <article className="space-y-7 rounded-3xl border border-slate-200 bg-white p-7 text-sm leading-7 text-slate-600 dark:border-border dark:bg-surface dark:text-slate-300 sm:p-10">
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Credit purchases</h2><p className="mt-2">vgAI2 sells prepaid credits for use within the service. Credits are added to your account after Razorpay confirms a successful payment.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">No refunds for purchased credits</h2><p className="mt-2">All credit purchases are final and non-refundable, including unused credits. Please review the selected amount and the final price in Razorpay Checkout before completing payment.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">No expiry</h2><p className="mt-2">Purchased credits do not expire while your vgAI2 account remains active.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Cancelling a generation</h2><p className="mt-2">Credits are reserved when a generation starts because the underlying provider begins work at that time. Cancelling a generation does not refund its credits. If the provider fails before producing work, vgAI2 automatically refunds the associated credits.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Duplicate or unauthorized payments</h2><p className="mt-2">If you believe you were charged more than once or did not authorize a payment, contact us promptly at <a className="font-medium text-brand-600 hover:underline dark:text-brand-300" href="mailto:hello@vgai2.com">hello@vgai2.com</a> with your Razorpay payment ID. We will investigate the transaction and respond as soon as reasonably possible.</p></section>
      </article>
    </div>
  );
}
