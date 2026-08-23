# vgAI frontend — Next.js (App Router) built to a standalone server bundle.
#
# Important: every NEXT_PUBLIC_* value is inlined into the JavaScript at BUILD
# time, not read at run time. That is why they arrive as ARGs here rather than
# as env vars in docker-compose.yml's frontend service — changing one means
# rebuilding this image, not just restarting the container.
#
# NEXT_PUBLIC_BACKEND_URL defaults to the relative path "/api" precisely so the
# domain name never gets baked in: the browser resolves /api against whatever
# host it loaded the page from, and nginx forwards it to the backend. Changing
# the domain then needs no frontend rebuild at all.

# ---------------------------------------------------------------------------
# Stage 1 — dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

# Next.js' native binaries expect glibc symbols Alpine's musl doesn't provide.
RUN apk add --no-cache libc6-compat

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2 — build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_BACKEND_URL=/api

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_TELEMETRY_DISABLED=1

# src/lib/supabaseClient.ts calls createClient() at module scope, so a missing
# URL/key fails during prerendering with a confusing stack. Fail here instead,
# where the message names the actual problem.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
    || (echo "ERROR: build arg NEXT_PUBLIC_SUPABASE_URL is empty — set it in the root .env" && exit 1)
RUN test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    || (echo "ERROR: build arg NEXT_PUBLIC_SUPABASE_ANON_KEY is empty — set it in the root .env" && exit 1)

# The project has no public/ directory today; create it so the COPY in the
# runtime stage below succeeds either way, and keeps working if one is added.
RUN mkdir -p public && npm run build

# ---------------------------------------------------------------------------
# Stage 3 — runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

WORKDIR /app

# standalone/ carries server.js plus the traced subset of node_modules. static/
# and public/ are deliberately not included in it by Next, so they are copied
# separately — server.js serves them once they sit at these exact paths.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
