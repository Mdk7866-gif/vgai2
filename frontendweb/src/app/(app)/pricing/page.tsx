import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Understand vgAI2 credits and how credit purchases work.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-border dark:bg-surface sm:p-10">
        <p className="eyebrow">Pricing</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">Simple, credit-based pricing.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">vgAI2 uses credits for generation. You see the credit cost before starting a paid action, and your balance is always visible in your account.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-border dark:bg-surface"><h2 className="font-semibold text-slate-900 dark:text-white">Buy only what you need</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Choose a credit amount from your Profile page. The final INR amount is shown in Razorpay Checkout before payment.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-border dark:bg-surface"><h2 className="font-semibold text-slate-900 dark:text-white">Costs shown up front</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Generation costs vary by feature and selected quality tier. vgAI2 displays the cost before the work begins.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-border dark:bg-surface"><h2 className="font-semibold text-slate-900 dark:text-white">Credits do not expire</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Purchased credits remain in your account until you use them. They are not refundable after purchase.</p></article>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-7 dark:border-border dark:bg-surface"><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Payments and refunds</h2><p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">Payments are processed securely by Razorpay. Review our <Link href="/cancellation-refund-policy" className="font-medium text-brand-600 hover:underline dark:text-brand-300">Cancellation &amp; Refund Policy</Link> before buying credits.</p></section>
    </div>
  );
}
