# vgAI — project context (hand this to an AI first)

The project workspace limits pasted and edited scripts to 4,000 words. The browser tells the creator how many words to remove, and the backend rejects an over-limit direct update as well. The website favicon matches the navbar's violet-and-white vgAI2 mark.

Docker Hub deployment: use [DOCKERHUB_DEPLOY.md](./DOCKERHUB_DEPLOY.md) and
`compose.deploy.yaml` to pull `mdk7866/vgai2-backend` and
`mdk7866/vgai2-frontend` on EC2 without server-side builds. The existing
Dockerfiles and .dockerignore files remain in each application directory.

# Launch update — vgAI2.com (15 Sep 2026)

The visible customer and admin brand is **vgAI2**; internal `vgai2` identifiers remain unchanged. The customer product will deploy at `https://vgai2.com`; its frontend provides public SEO metadata, `robots.txt`, sitemap, manifest, pricing, terms-and-conditions, cancellation-refund-policy, privacy-policy, about, and contact routes. `hello@vgai2.com` is the public support/legal email.

Razorpay Live checkout uses both browser signature verification and the signed server webhook at `https://vgai2.com/api/payments/webhook` (`payment.captured`, `payment.failed`). Before enabling it, run `vgai2admin/migration/004_atomic_razorpay_credit_settlement.sql` manually in the shared Supabase SQL Editor. The `settle_credit_topup()` function locks an order so concurrent browser/webhook deliveries cannot credit it twice. Purchased credits do not expire and are non-refundable; cancelled generations remain charged once their provider work begins, while provider failures are refunded.

Customer Profile → Payment History now shows a copyable Razorpay payment ID for a completed payment. The local-only vgai2admin `/payment` support lookup uses that ID to display the matching shared transaction and user; it alone may display the stored checkout signature.

A single self-contained briefing on **both** halves of this product. Written to
be pasted or attached at the start of a conversation so an assistant understands
the setup before touching anything.

Everything below is true as of **11 Sep 2026**.

---

## 1. There are two websites, not one

| | Folder | What it is | Deployed? |
|---|---|---|---|
| **vgAI** | `C:\Users\ASUS\OneDrive\Desktop\vgai2` | The customer-facing product | **Not yet** — Docker/EC2 stack written and building, deployment planned. See that repo's `DOCKERHUB_DEPLOY.md`. |
| **vgAI Admin** | `C:\Users\ASUS\OneDrive\Desktop\vgai2admin` | Internal portal for running vgAI | **No — local only, by design** |

They are **two separate git repos**. There is no parent repo above them.

### vgAI — the product

An AI studio SaaS for **faceless video creators** and long-form storytelling
channels (educational, financial, historical, story-based). Instead of
generating a whole video from one uneditable click, it gives creators a granular
workspace — **script → scenes → media assets** — with control at every step, for
both long-form and short-form (Shorts/Reels).

The loop: research a topic and write/generate a script → split it into visual
scenes → reuse saved **character** and **style-template** libraries for
consistency → generate an image, then an animation, per scene → export and stitch
in Premiere/CapCut. (Voiceover is specced and partly wired — settings save, TTS
generation is not built.)

Billing uses an internal currency, **credits** (100 credits = $1), topped up via
Razorpay. Credits are **reserved before** the AI provider is called, never
deducted after success — providers bill the moment work starts, so charging only
on success meant absorbing the cost of abandoned work. Cancelling does not
refund; credits return only when the provider produced nothing.

### vgAI Admin — this repo

The internal back office. It has **no login of its own** and is **never
deployed** — it runs on the operator's machine only. Its backend holds the shared
Supabase **service-role key**, so it can read and write every user's data. That,
plus never exposing it publicly, is the entire security model.

What it covers: every signed-up **user** (balance, purchased, granted, joined,
last login, with search + sort); **access control** (§3); that user's
**characters**, **style templates**, **payment history**, **usage history**, and
a read-only view of a single **project**; **granting free credits** (recorded
separately from purchases so they never inflate revenue figures); and CRUD on the
two **starter catalogs** every vgAI user imports from — the **default style
templates** and the **default characters**; and the **contact submissions**
users send through vgAI's support form. The two catalogs are the only places
here whose writes are product-wide rather than scoped to one user: an edit
changes what *everyone* sees on their next visit.

---

## 2. The most important fact: they share one database

Both apps point at the **same Supabase Postgres project** and the **same
Cloudinary account** — one `users` table, one `credit_topups` table, one set of
media folders. Deliberate, not a misconfiguration.

What that means in practice:

- A schema change is applied **once**, to the one shared DB.
- An admin-side edit to a character or style template writes rows vgAI's users
  read. vgAI's invariants (one default style template per user; style-template
  word-count ceilings) bind admin writes too — **nothing in the schema enforces
  them**.
- A feature can be half-built without looking it. See §3.

---

## 3. Access control spans both repos

The easiest thing here to misdiagnose, because its two halves live in different
folders:

- **The admin writes the rules** — a mode (`allowed_all` or `allowed_only`) plus
  an allowed list and a restricted list, in `access_control_list` /
  `access_system_settings`.
- **vgAI enforces them** — `vgai2/backend/app/access_control.py`, called from
  `app/auth.py::get_current_user`, the single dependency every protected route
  already goes through (including `POST /users/sync` right after login).

Two behaviours to know before debugging:

- **Signing in is not gated.** Supabase auth is client-side and never touches the
  backend. A blocked user completes Google login normally and is rejected on
  their *first backend call* (403 `ACCESS_REVOKED`), at which point vgAI's
  frontend signs them out and explains. **"They were able to log in" is expected,
  not a bug.**
- **Switching to `allowed_only` with an empty allowed list is refused** (409).
  That guard is the single most important thing in the feature — it's what stops
  one click from locking every user, including the operator, out of the product.
- **Invite requests are only for signed-out visitors in `allowed_only`.** Home
  shows signed-in users and everyone in `allowed_all` a welcome panel instead.
  The admin can approve or deny requests, then permanently delete reviewed
  history; pending rows cannot be deleted, and deleting approved history never
  removes the user's separate allowed-list entry.

---

## 4. Ports — never let the two apps collide

| | vgAI (`vgai2`) | Admin (`vgai2admin`) |
|---|---|---|
| Backend | **8000** | **8001** |
| Frontend | **3000** | **3001** |

Both projects were on 8000/3000 once, and it took vgAI down for real users while
giving no useful signal. **Windows lets two processes bind the same TCP port
without raising an error** — there is no "address already in use" to notice. The
admin backend quietly answered vgAI's requests; its router only serves
`/admin/*`, so every vgAI call (`/users/me`, `/users/sync`, `/payments/...`)
matched nothing and returned FastAPI's default `{"detail":"Not Found"}`. Users
signed in fine and landed in a fully rendered, completely dead app.

Access control silently died with it: `enforce_access` only runs inside vgAI's
`get_current_user`, which was never reached — so blocked emails got a 404 instead
of the 403 the frontend signs people out on, and **blocked users appeared to have
access**. The lists and the enforcement code were correct the whole time.

> **Debugging rule: if vgAI returns a bare "Not Found" for everything, check what
> is actually listening on port 8000 before investigating anything else.**

Do not reintroduce a `?? "http://localhost:8000"` fallback in this repo's
`frontendweb/src/lib/api.ts` — a missing `.env.local` would recreate the whole
bug. Full write-up: this repo's `README.md` §10.3.

---

## 5. Running them

All four servers can run at once — that's the point of the port split. A frontend
page that calls its backend needs **both** of that app's servers up.

```bash
# vgAI (the product) — http://localhost:3000
cd C:\Users\ASUS\OneDrive\Desktop\vgai2\backend      && uv sync && uv run dev       # :8000
cd C:\Users\ASUS\OneDrive\Desktop\vgai2\frontendweb  && npm install && npm run dev  # :3000

# vgAI Admin — http://localhost:3001
cd C:\Users\ASUS\OneDrive\Desktop\vgai2admin\backend     && uv sync && uv run dev      # :8001
cd C:\Users\ASUS\OneDrive\Desktop\vgai2admin\frontendweb && npm install && npm run dev # :3001
```

Credentials live in each app's own `backend/.env` and `frontendweb/.env.local`.
Both are gitignored, so they don't travel with a fresh clone.

**Stack**, shared by both: Next.js (App Router) + Tailwind + TypeScript on the
frontend, FastAPI + uv on the backend, Supabase (Postgres + Google OAuth) for
data and auth, Cloudinary for media. vgAI additionally integrates OpenAI, Gemini,
OpenRouter (Perplexity / Claude / image-to-video), ElevenLabs, and Razorpay.

---

## 6. Deeper docs, if the assistant can read files

Each repo's own docs are **authoritative for that repo**; this file is only the
layer above them.

| File | Read it for |
|---|---|
| `vgai2\README.md` | vgAI's full product spec: every route, page-by-page behavior, the credit system, tech stack, full DB schema. |
| `vgai2\AGENTS.md` | What is *actually implemented* in vgAI vs. specced, plus its architecture and conventions. |
| `vgai2admin\README.md` | The admin's spec with a **Built / Not built** status per route, the access-control data model, the resolved-decisions log. |
| `vgai2admin\AGENTS.md` | The admin's architecture and cross-repo rules. |
| `vgai2\vgaidatabase.dbml` | Canonical DB schema. |
| `vgai2\vgaidatabase.sql` | The sole canonical runnable DDL snapshot for the shared database, including credit-accounting functions. There is deliberately no duplicate in `vgai2admin`; admin migrations must update this file and the canonical DBML. |
| `vgai2admin\migration\` | The primary home for schema changes: `vgai2admin_migration.sql` (the original, already applied) plus numbered ones since. Each idempotent, each run by hand in Supabase. (`vgai2\migration\` holds vgAI's own two earlier migrations, both applied — put new ones here.) |
| `vgai2\DOCKERHUB_DEPLOY.md` | vgAI's deployment runbook — EC2 + Docker + nginx + Let's Encrypt, end to end. Read it before answering any deployment question; don't reconstruct the setup from `docker-compose.yml` alone. |
| `vgai2\QUICK_DEPLOYMENT.md` | Repeatable Windows-to-EC2 update guide for current `vgai2-*` images. Initial setup lives in `DOCKERHUB_DEPLOY.md`; the nginx template is required. |

---

## 7. Standing rules for anyone working on this

1. **Don't assume a feature exists because it's documented.** Both READMEs
   describe intended behavior and have drifted from the code (vgAI's still names
   Gemini for flows that now use OpenAI). Each `AGENTS.md` tracks what is real —
   check the actual route/component first.
2. **When a task spans both repos, say so and do both halves** — or flag the
   missing half clearly. Shipping only the admin side changes rows and nothing
   else.
3. **Never give `vgai2admin` a deployment path** without revisiting auth first.
   No login + service-role key + local-only is the whole security model.
4. **Next.js version drift is real in both frontends** — notably `params` is a
   `Promise` even where you wouldn't expect it (server layouts `await params`;
   client pages use `useParams()`). Read that repo's
   `frontendweb\node_modules\next\dist\docs\` before writing Next.js code.
5. **Commit each repo separately.** They're independent; there is no umbrella
   repo.
6. **Schema changes go in `vgai2admin/migration/`**, numbered and idempotent,
   and are run **by hand** in the Supabase SQL Editor. Neither backend can
   execute DDL — they hold the Supabase REST service-role key, not a Postgres
   connection string. So an assistant can write a migration but cannot apply
   it; say so rather than assuming a table exists. (`vgai2admin_migration.sql`
   in that folder is the original, already-applied one.)
7. **vgAI's `/contact` form is intentionally unauthenticated** — the single
   ungated write in the product. A revoked user is signed out the moment the
   backend rejects them, and someone who cannot sign in at all still has to be
   able to report that, so gating it would lock out exactly the people it
   exists for. Don't "tidy" it onto the normal auth dependency; that would run
   `enforce_access()` against them.
8. **A starter catalog's images are shared product assets — copy them on
   import, don't reference them.** Both catalogs live in root-level Cloudinary
   folders (`default_style_templates/`, `default_characters/`), not under any
   user. A starter style template may show an ordered gallery of up to three
   examples, browsed through `MultipleImageViewCardPopUp` (previous/next
   buttons, ←/→ keys, thumbnails, and a counter), but vgAI copies only its
   first-priority image into the importer's own folder. The admin generates
   gallery examples concurrently as a single-subject, multi-subject, and
   environment-led set so they demonstrate the style's range rather than one
   repeated protagonist. When vgAI imports from **either** catalog, it makes that real
   Cloudinary *copy*, so deleting a catalog entry can never blank an image
   someone already imported. This was learned the hard way twice
   already: `project_characters` used to store a copy of the *URL string*, so
   deleting a library character blanked it in every project that had imported
   it; the style-template catalog had the same flaw for its demo image and was
   fixed later, with the affected rows backfilled. Any future "import from a
   shared asset" path should copy, not reference — and note the two guards
   named `_owns_demo_image` / `_owns_character_sheet` only *avoid deleting*
   someone else's asset, which is not the same as owning your own.
<!-- Image preview behavior, updated September 2026 -->
Single-image previews in both apps use `ImageZoomPopUp` with direct image URLs (`unoptimized`) so already-cached originals can be reused. Loading is tracked by URL and checked against the mounted image's completion state; reopening does not force a loading reset. The viewer supports pinch/scroll/double-tap zoom, dragging, +/−/0 keyboard controls, a bottom toolbar, an image title and scale indicator, focus containment/restoration, and a retryable error state. Starter style galleries continue using `MultipleImageViewCardPopUp` for previous/next navigation. A first uncached image still requires a network download.
