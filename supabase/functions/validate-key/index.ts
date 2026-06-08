// Trust Wallet Access Gate — edge function
// Handles: validate, check_session, session_heartbeat, logout,
// and admin actions (list_keys, create_key, revoke_key, delete_key,
// update_key, clear_devices, list_audit, list_alerts).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const ADMIN_MASTER_KEY = 'ascend2trusted';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function rand(n = 32) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}
function preview(k: string) { return k.length <= 6 ? k : k.slice(0, 3) + '…' + k.slice(-3); }
function durationFor(type: string): number | null {
  switch (type) {
    case 'daily': return 24 * 3600 * 1000;
    case '3day': return 3 * 24 * 3600 * 1000;
    case 'weekly': return 7 * 24 * 3600 * 1000;
    case 'monthly': return 30 * 24 * 3600 * 1000;
    case 'lifetime': return null;
    default: return 7 * 24 * 3600 * 1000;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function audit(action: string, opts: Record<string, unknown> = {}) {
  try { await admin.from('audit_logs').insert({ action, actor_type: 'system', ...opts }); } catch {}
}

async function handleValidate(key: string, fp: string, ip: string) {
  if (!key || typeof key !== 'string') return json({ error: 'Key required' }, 400);
  const trimmed = key.trim();
  const hash = await sha256(trimmed);

  // Master admin shortcut — auto-bootstrap if missing
  if (trimmed === ADMIN_MASTER_KEY) {
    let { data: row } = await admin.from('access_keys').select('*').eq('key_hash', hash).maybeSingle();
    if (!row) {
      const ins = await admin.from('access_keys').insert({
        key_hash: hash, key_preview: preview(trimmed), key_type: 'lifetime',
        key_name: 'Master Admin', key_value: trimmed, is_sub_admin: false,
        activated_at: new Date().toISOString(),
      }).select('*').single();
      row = ins.data!;
    }
    return await startSession(row, fp, ip, true);
  }

  const { data: row, error } = await admin.from('access_keys').select('*').eq('key_hash', hash).maybeSingle();
  if (error || !row) { await audit('key_validate_fail', { metadata: { reason: 'not_found' }, ip_address: ip, success: false }); return json({ error: 'Invalid key' }, 401); }
  if (row.is_revoked) return json({ error: 'Key revoked' }, 403);

  // Device binding (single device per key)
  if (row.device_fingerprint && row.device_fingerprint !== fp) {
    await admin.from('device_attempts').insert({ key_id: row.id, device_fingerprint: fp, ip_address: ip, blocked: true });
    await admin.from('security_alerts').insert({ key_id: row.id, device_fingerprint: fp, attempt_ip: ip, reason: 'device_mismatch', blocked: true });
    return json({ error: 'This key is bound to another device' }, 403);
  }

  // Activate / bind on first use
  const patch: Record<string, unknown> = {};
  if (!row.activated_at) {
    patch.activated_at = new Date().toISOString();
    const dur = durationFor(row.key_type);
    if (dur) patch.expires_at = new Date(Date.now() + dur).toISOString();
  }
  if (!row.device_fingerprint) { patch.device_fingerprint = fp; patch.device_count = 1; }
  if (Object.keys(patch).length) {
    const u = await admin.from('access_keys').update(patch).eq('id', row.id).select('*').single();
    if (u.data) Object.assign(row, u.data);
  }

  // Expiry check
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'Key expired' }, 403);

  const isAdmin = row.key_value === ADMIN_MASTER_KEY || row.key_name === 'Master Admin';
  return await startSession(row, fp, ip, isAdmin);
}

async function startSession(row: any, fp: string, ip: string, isAdmin: boolean) {
  const token = rand(32);
  const csrf = rand(24);
  const tokenHash = await sha256(token);
  await admin.from('access_sessions').insert({ session_token: token, session_token_hash: tokenHash, key_id: row.id });
  await admin.from('key_sessions').insert({ key_id: row.id, session_token: token });
  await admin.from('access_keys').update({ session_count: (row.session_count || 0) + 1 }).eq('id', row.id);
  await audit('key_validate_ok', { actor_id: row.id, actor_label: row.key_name || row.key_preview, ip_address: ip });
  return json({
    valid: true,
    session_token: token,
    csrf_token: csrf,
    key_type: row.key_type,
    activated_at: row.activated_at,
    expires_at: row.expires_at,
    is_admin: isAdmin,
    is_sub_admin: !!row.is_sub_admin,
    key_name: row.key_name,
    key_preview: row.key_preview,
  });
}

async function handleCheckSession(token: string | undefined) {
  if (!token) return json({ valid: false });
  const { data: sess } = await admin.from('access_sessions').select('*').eq('session_token', token).maybeSingle();
  if (!sess) return json({ valid: false });
  const { data: row } = await admin.from('access_keys').select('*').eq('id', sess.key_id).maybeSingle();
  if (!row || row.is_revoked) return json({ valid: false });
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return json({ valid: false });
  const isAdmin = row.key_value === ADMIN_MASTER_KEY || row.key_name === 'Master Admin';
  await admin.from('access_sessions').update({ last_validated: new Date().toISOString() }).eq('id', sess.id);
  return json({
    valid: true, session_token: token, csrf_token: rand(24),
    key_type: row.key_type, activated_at: row.activated_at, expires_at: row.expires_at,
    is_admin: isAdmin, is_sub_admin: !!row.is_sub_admin,
    key_name: row.key_name, key_preview: row.key_preview,
  });
}

async function handleHeartbeat(token: string | undefined) {
  if (!token) return json({ revoked: true });
  const { data: sess } = await admin.from('access_sessions').select('*').eq('session_token', token).maybeSingle();
  if (!sess) return json({ revoked: true });
  const { data: row } = await admin.from('access_keys').select('id,is_revoked,expires_at').eq('id', sess.key_id).maybeSingle();
  if (!row || row.is_revoked) return json({ revoked: true });
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return json({ revoked: true });
  await admin.from('access_sessions').update({ last_validated: new Date().toISOString() }).eq('id', sess.id);
  await admin.from('key_sessions').update({ last_heartbeat: new Date().toISOString() }).eq('session_token', token);
  return json({ ok: true });
}

async function handleLogout(token: string | undefined) {
  if (token) {
    await admin.from('access_sessions').delete().eq('session_token', token);
  }
  return json({ ok: true });
}

// -------- Admin actions (gated by master session token) --------
async function requireAdmin(token: string | undefined): Promise<{ ok: boolean; row?: any }> {
  if (!token) return { ok: false };
  const { data: sess } = await admin.from('access_sessions').select('*').eq('session_token', token).maybeSingle();
  if (!sess) return { ok: false };
  const { data: row } = await admin.from('access_keys').select('*').eq('id', sess.key_id).maybeSingle();
  if (!row) return { ok: false };
  const isAdmin = row.key_value === ADMIN_MASTER_KEY || row.key_name === 'Master Admin';
  return { ok: isAdmin, row };
}

async function handleAdmin(action: string, body: any) {
  const gate = await requireAdmin(body.session_token);
  if (!gate.ok) return json({ error: 'Admin only' }, 403);

  if (action === 'admin_list_keys') {
    const { data } = await admin.from('access_keys').select('id,key_preview,key_name,key_type,activated_at,expires_at,is_revoked,device_fingerprint,session_count,created_at,key_value').order('created_at', { ascending: false });
    return json({ keys: data || [] });
  }

  if (action === 'admin_create_key') {
    const key_type = body.key_type || 'weekly';
    const key_name = body.key_name || null;
    const value = (body.key_value && String(body.key_value).trim()) || rand(8);
    const hash = await sha256(value);
    const { data, error } = await admin.from('access_keys').insert({
      key_hash: hash, key_preview: preview(value), key_type, key_name, key_value: value,
    }).select('*').single();
    if (error) return json({ error: error.message }, 400);
    await audit('key_create', { actor_id: gate.row.id, target_id: data.id, target_label: key_name || preview(value) });
    return json({ key: data, plaintext: value });
  }

  if (action === 'admin_revoke_key') {
    await admin.from('access_keys').update({ is_revoked: true }).eq('id', body.key_id);
    await admin.from('access_sessions').delete().eq('key_id', body.key_id);
    await audit('key_revoke', { actor_id: gate.row.id, target_id: body.key_id });
    return json({ ok: true });
  }
  if (action === 'admin_unrevoke_key') {
    await admin.from('access_keys').update({ is_revoked: false }).eq('id', body.key_id);
    return json({ ok: true });
  }
  if (action === 'admin_delete_key') {
    await admin.from('access_keys').delete().eq('id', body.key_id);
    await audit('key_delete', { actor_id: gate.row.id, target_id: body.key_id });
    return json({ ok: true });
  }
  if (action === 'admin_clear_device') {
    await admin.from('access_keys').update({ device_fingerprint: null, device_count: 0 }).eq('id', body.key_id);
    return json({ ok: true });
  }
  if (action === 'admin_audit') {
    const { data } = await admin.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    return json({ logs: data || [] });
  }
  if (action === 'admin_alerts') {
    const { data } = await admin.from('security_alerts').select('*').order('created_at', { ascending: false }).limit(100);
    return json({ alerts: data || [] });
  }

  return json({ error: 'Unknown admin action' }, 400);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const action = String(body.action || '');

  try {
    if (action === 'validate') return await handleValidate(body.key, body.device_fingerprint || '', ip);
    if (action === 'check_session') return await handleCheckSession(body.session_token);
    if (action === 'session_heartbeat') return await handleHeartbeat(body.session_token);
    if (action === 'logout') return await handleLogout(body.session_token);
    if (action.startsWith('admin_')) return await handleAdmin(action, body);
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || 'Server error' }, 500);
  }
});