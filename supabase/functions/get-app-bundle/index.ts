// Serves the wallet app bundle (HTML + CSS + obfuscated JS) only to
// holders of a valid access session. Source is NEVER in the static build.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token, x-csrf-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---------- bundle assembly (cached at cold start) ----------
import {
  wallet_top_html,
  wallet_bottom_html,
  trust_css,
  trust_js,
  notify_js,
  p2p_bridge_js,
  history_js,
  tail_js,
} from "./assets.ts";

function b64encode(s: string): string {
  // Encode UTF-8 string to base64
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa available in Deno via globalThis
  return btoa(bin);
}

// Lightweight obfuscation: base64-wrap each module, then a single bootstrap
// concatenates and evaluates them in-order in an isolated wrapper.
function obfuscate(modules: { name: string; code: string }[]): string {
  const encoded = modules.map((m) => ({ n: m.name, c: b64encode(m.code) }));
  const payload = b64encode(JSON.stringify(encoded));
  // Wrapper: decodes payload, decodes each module, evals in global scope.
  return `(function(_p){try{var d=function(s){return decodeURIComponent(Array.prototype.map.call(atob(s),function(c){return '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)}).join(''))};var L=JSON.parse(d(_p));for(var i=0;i<L.length;i++){try{(0,eval)(d(L[i].c))}catch(e){console.error('bundle '+L[i].n+':',e)}}}catch(e){console.error('bundle err',e)}})(${JSON.stringify(payload)});`;
}

let cached: { html: string; css: string; js: string } | null = null;
function buildBundle() {
  if (cached) return cached;
  const html = wallet_top_html + "\n" + wallet_bottom_html;
  const js = obfuscate([
    { name: "trust", code: trust_js },
    { name: "notify", code: notify_js },
    { name: "p2p", code: p2p_bridge_js },
    { name: "history", code: history_js },
    { name: "tail", code: tail_js },
  ]);
  cached = { html, css: trust_css, js };
  return cached;
}

// ---------- session validation ----------
async function validSession(token: string | null): Promise<boolean> {
  if (!token) return false;
  const { data: sess } = await admin
    .from("access_sessions")
    .select("id,key_id")
    .eq("session_token", token)
    .maybeSingle();
  if (!sess) return false;
  const { data: row } = await admin
    .from("access_keys")
    .select("id,is_revoked,expires_at")
    .eq("id", sess.key_id)
    .maybeSingle();
  if (!row || row.is_revoked) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return false;
  return true;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Pull token from header or body
    let token = req.headers.get("x-session-token");
    if (!token && req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.session_token === "string") token = body.session_token;
      } catch { /* ignore */ }
    }
    if (!(await validSession(token))) {
      return json({ error: "Unauthorized" }, 403);
    }
    const bundle = buildBundle();
    return json(bundle, 200);
  } catch (e) {
    return json({ error: (e as Error).message || "Server error" }, 500);
  }
});