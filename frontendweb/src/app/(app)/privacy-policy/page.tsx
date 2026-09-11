import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - vgAI",
  description:
    "How vgAI collects, uses, stores, and protects your data across scripts, generated media, and your account.",
};

const LAST_UPDATED = "August 22, 2026";
const CONTACT_EMAIL = "mujamahe@gmail.com";

const sections: { id: string; title: string }[] = [
  { id: "overview", title: "1. Overview" },
  { id: "information-we-collect", title: "2. Information We Collect" },
  { id: "how-we-use-information", title: "3. How We Use Your Information" },
  { id: "third-party-services", title: "4. Third-Party Services We Use" },
  { id: "ai-generated-content", title: "5. AI-Generated Content & Your Scripts" },
  { id: "cookies-and-storage", title: "6. Cookies & Local Storage" },
  { id: "data-retention", title: "7. Data Retention" },
  { id: "data-security", title: "8. Data Security" },
  { id: "your-rights", title: "9. Your Rights & Choices" },
  { id: "childrens-privacy", title: "10. Children's Privacy" },
  { id: "international-transfers", title: "11. International Data Transfers" },
  { id: "changes", title: "12. Changes to This Policy" },
  { id: "contact", title: "13. Contact Us" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="mb-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-border dark:bg-surface sm:p-8">
        <p className="text-sm font-medium text-brand-600 dark:text-brand-400 mb-2">
          Legal
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-w-3xl">
          vgAI (&ldquo;vgAI,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) is an early-stage product that helps creators turn
          a script into scene-by-scene AI-generated images, animations, and
          voiceovers. This policy explains what data we collect when you use
          vgAI, why we collect it, which third-party providers we share it
          with to make the product work, and the choices you have. We&rsquo;re
          a small team building this in the open — if anything here is
          unclear, email us and we&rsquo;ll clarify or fix it.
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
        {/* Table of contents */}
        <nav aria-label="Policy sections" className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-6 lg:self-start dark:border-border dark:bg-surface">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
            On this page
          </p>
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="space-y-10 min-w-0 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-border dark:bg-surface">
          <Section id="overview" title="1. Overview">
            <p>
              vgAI lets you paste a script, split it into scenes, and generate
              matching images, animations, and voiceovers using third-party AI
              providers, reusing saved character and style-template libraries
              you build. To provide this, we necessarily process the content
              you submit (scripts, prompts, uploaded images) and account data
              tied to your login. This policy covers everything collected
              through the vgAI website and app.
            </p>
            <p>
              This policy is written for India-based operation and users, and
              is intended to align with the Indian Digital Personal Data
              Protection Act (DPDP Act, 2023) and applicable IT Act rules. If
              you are located outside India, your data may still be processed
              in accordance with this policy and the practices of the
              third-party providers listed in Section 4.
            </p>
          </Section>

          <Section id="information-we-collect" title="2. Information We Collect">
            <p>
              <strong className="text-slate-800 dark:text-slate-100">
                Account information.
              </strong>{" "}
              When you sign in with Google (via Supabase Auth), we receive
              your name, email address, and profile picture. We don&rsquo;t
              see or store your Google password.
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-100">
                Content you create.
              </strong>{" "}
              Scripts you paste or generate, scene breakdowns, image/video
              generation prompts, character descriptions, style-template
              settings, and any images or videos you upload or generate
              through vgAI. This is the core content the product exists to
              help you produce.
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-100">
                Payment information.
              </strong>{" "}
              When you top up credits, payments are processed by Razorpay. We
              store the resulting order ID, amount, currency, and payment
              status — we never see or store your card, UPI, or bank
              account details; those are handled entirely by Razorpay.
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-100">
                Usage data.
              </strong>{" "}
              Credit balance and spend history broken down by feature
              (script generation, scene splitting, image/animation
              generation), so you can review your usage on the Profile page.
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-100">
                Technical data.
              </strong>{" "}
              Standard web request data (IP address, browser type, device
              type) may be logged by our hosting infrastructure for security
              and abuse prevention, and by third-party providers as described
              below.
            </p>
          </Section>

          <Section id="how-we-use-information" title="3. How We Use Your Information">
            <ul className="list-disc list-outside pl-5 space-y-1.5">
              <li>To operate your account and let you log in securely.</li>
              <li>
                To generate the images, animations, voiceovers, and scripts
                you request, by sending your prompts/content to the AI
                providers listed below.
              </li>
              <li>
                To track and enforce your credit balance so generation stays
                accurately billed.
              </li>
              <li>To process credit top-up payments and keep a record of them.</li>
              <li>
                To store your character/style-template libraries and generated
                projects so you can come back and reuse them later.
              </li>
              <li>
                To detect abuse, prevent fraud, and keep the service secure.
              </li>
              <li>
                To respond to support requests you send us directly.
              </li>
            </ul>
            <p>
              We do not sell your personal information. We do not use your
              scripts or generated media to train our own AI models.
            </p>
          </Section>

          <Section id="third-party-services" title="4. Third-Party Services We Use">
            <p>
              vgAI is built on top of several third-party providers. Each
              receives only the data necessary to perform its specific
              function, and each has its own privacy policy governing how it
              handles that data.
            </p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left text-sm border-collapse min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-4 font-semibold text-slate-700 dark:text-slate-200">
                      Provider
                    </th>
                    <th className="py-2 pr-4 font-semibold text-slate-700 dark:text-slate-200">
                      Purpose
                    </th>
                    <th className="py-2 font-semibold text-slate-700 dark:text-slate-200">
                      Data shared
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="py-2 pr-4 align-top text-slate-800 dark:text-slate-100">Supabase</td>
                    <td className="py-2 pr-4 align-top">Authentication (Google OAuth) &amp; primary database</td>
                    <td className="py-2 align-top">Account info, all app data described in Section 2</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top text-slate-800 dark:text-slate-100">OpenAI</td>
                    <td className="py-2 pr-4 align-top">Character/style-template/scene image generation, some prompt rewriting</td>
                    <td className="py-2 align-top">Prompts, scripts, generated images</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top text-slate-800 dark:text-slate-100">OpenRouter (Anthropic Claude, Perplexity, video models)</td>
                    <td className="py-2 pr-4 align-top">Script generation, topic research, scene splitting, animation generation</td>
                    <td className="py-2 align-top">Scripts, prompts, scene images used as animation reference frames</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top text-slate-800 dark:text-slate-100">Google Gemini</td>
                    <td className="py-2 pr-4 align-top">Higher-tier (&ldquo;Pro&rdquo;) scene splitting</td>
                    <td className="py-2 align-top">Scripts, character/style-template data</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top text-slate-800 dark:text-slate-100">Cloudinary</td>
                    <td className="py-2 pr-4 align-top">Hosting your uploaded and AI-generated images/videos</td>
                    <td className="py-2 align-top">Image and video files</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top text-slate-800 dark:text-slate-100">Razorpay</td>
                    <td className="py-2 pr-4 align-top">Payment processing for credit top-ups</td>
                    <td className="py-2 align-top">Name/email, payment amount &mdash; card/bank details go directly to Razorpay, never through us</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top text-slate-800 dark:text-slate-100">ElevenLabs</td>
                    <td className="py-2 pr-4 align-top">Voiceover generation (planned, not yet active)</td>
                    <td className="py-2 align-top">Script text, once this feature is enabled</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              We choose providers that offer API-level data processing
              agreements and do not use submitted content to train their own
              models by default where such an option is available, but we
              encourage you to review each provider&rsquo;s own policy if you
              have specific concerns.
            </p>
          </Section>

          <Section id="ai-generated-content" title="5. AI-Generated Content & Your Scripts">
            <p>
              Scripts, prompts, and reference images you submit are sent to
              the third-party AI providers listed in Section 4 solely to
              generate the output you requested (an image, animation, script,
              or voiceover). We retain this content in our database so your
              projects, characters, and style templates remain available to
              you across sessions and devices.
            </p>
            <p>
              You are responsible for the content of the scripts you submit
              and the outputs you generate, and for ensuring you have the
              rights to any characters, likenesses, or material you ask vgAI
              to reference or reproduce.
            </p>
          </Section>

          <Section id="cookies-and-storage" title="6. Cookies & Local Storage">
            <p>
              We use essential cookies/local storage to keep you signed in
              (via Supabase&rsquo;s session tokens) and to remember your
              preferences, such as your light/dark theme choice and your
              active script-generation session. We do not use third-party
              advertising or cross-site tracking cookies.
            </p>
          </Section>

          <Section id="data-retention" title="7. Data Retention">
            <p>
              We keep your account data and generated content for as long as
              your account is active. If you delete a project, its scenes and
              associated media are removed from our storage; a summary of
              credits spent on that project is retained for your usage
              history and our accounting records, even after the project
              itself is deleted. Payment records are retained as required for
              financial and tax record-keeping.
            </p>
            <p>
              You may request deletion of your account and associated
              personal data at any time by contacting us — see Section 13.
            </p>
          </Section>

          <Section id="data-security" title="8. Data Security">
            <p>
              We use industry-standard measures to protect your data,
              including encrypted connections (HTTPS) for all traffic and
              access controls on our database and file storage. No method of
              transmission or storage is 100% secure, and we cannot guarantee
              absolute security, but we work to protect your information and
              will notify affected users in the event of a data breach that
              poses a real risk to your rights, as required by applicable
              law.
            </p>
          </Section>

          <Section id="your-rights" title="9. Your Rights & Choices">
            <ul className="list-disc list-outside pl-5 space-y-1.5">
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate account information.</li>
              <li>
                Request deletion of your account and associated personal
                data, subject to reasonable retention needs described in
                Section 7.
              </li>
              <li>Export your saved scripts, characters, and style templates.</li>
              <li>Withdraw consent for optional processing where applicable.</li>
            </ul>
            <p>
              To exercise any of these rights, email us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . We&rsquo;ll respond within a reasonable time.
            </p>
          </Section>

          <Section id="childrens-privacy" title="10. Children's Privacy">
            <p>
              vgAI is not directed at children under 18. We do not knowingly
              collect personal information from children. If you believe a
              child has provided us with personal data, contact us and
              we&rsquo;ll remove it.
            </p>
          </Section>

          <Section id="international-transfers" title="11. International Data Transfers">
            <p>
              Our third-party providers (Section 4) operate infrastructure in
              multiple countries, including the United States. By using vgAI,
              you understand your data may be processed outside India as part
              of these providers&rsquo; standard operations.
            </p>
          </Section>

          <Section id="changes" title="12. Changes to This Policy">
            <p>
              As vgAI is under active development, this policy may change as
              we add or change features and providers. We&rsquo;ll update the
              &ldquo;Last updated&rdquo; date above when we do, and for
              material changes we&rsquo;ll make a reasonable effort to notify
              active users. Continuing to use vgAI after a change means you
              accept the updated policy.
            </p>
          </Section>

          <Section id="contact" title="13. Contact Us">
            <p>
              Questions about this policy or your data? Reach out to us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
