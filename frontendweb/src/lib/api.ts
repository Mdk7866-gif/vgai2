import { supabase } from "./supabaseClient";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function authFetch(path: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);

    if (res.status === 403 && body?.detail?.code === "ACCESS_REVOKED") {
      // AuthContext owns the actual sign-out (it already has the supabase
      // client and session state) -- this just raises the flag. Dispatched
      // on window rather than passed through a callback since authFetch is
      // called from dozens of unrelated call sites with no context access.
      // mode/reason ride along so AccessRevokedModal can explain *why*, not
      // just show a generic "revoked" message -- see backend's
      // access_control.py::enforce_access for what populates them.
      window.dispatchEvent(
        new CustomEvent("vgai:access-revoked", {
          detail: { mode: body.detail.mode ?? null, reason: body.detail.reason ?? null },
        })
      );
      throw new Error(body.detail.message ?? "Your access to vgAI2 has been revoked.");
    }

    const detail = typeof body?.detail === "string" ? body.detail : null;
    throw new Error(detail ?? `Request failed (${res.status})`);
  }

  return res;
}
