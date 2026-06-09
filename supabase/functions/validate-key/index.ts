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

async function readAdminPassword(): Promise<string> {
  const { data } = await admin.from('app_settings').select('value').eq('id', 'admin_console').maybeSingle();
  const value = data?.value;
  if (value && typeof value === 'object' && 'password' in value) {
    const password = String((value as Record<string, unknown>).password || '').trim();
    if (password) return password;
  }
  return ADMIN_MASTER_KEY;
}

async function geoLookup(ip: string): Promise<{ country?: string; region?: string; city?: string }> {
  if (!ip) return {};
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { headers: { 'accept': 'application/json' } });
    if (!r.ok) return {};
    const j: any = await r.json();
    if (!j || j.success === false) return {};
    return { country: j.country || undefined, region: j.region || undefined, city: j.city || undefined };
  } catch { return {}; }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function rand(n = 32) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}
function preview(k: string) { return k.length <= 6 ? k : k.slice(0, 3) + '…' + k.slice(-3); }

// ---------- Address generation ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const HEX = '0123456789abcdef';
const HEXM = '0123456789abcdefABCDEF';
function rstr(n: number, set: string) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  let s = ''; for (let i = 0; i < n; i++) s += set[a[i] % set.length];
  return s;
}
function genAddr(chain: string): string {
  switch (chain) {
    case 'btc': return 'bc1q' + rstr(38, BECH32);
    case 'eth': case 'bnb': case 'avax': return '0x' + rstr(40, HEXM);
    case 'sol': return rstr(43 + (Math.random() < 0.5 ? 1 : 0), B58);
    case 'trx': return 'T' + rstr(33, B58);
    case 'ton': return 'UQ' + rstr(46, B58);
    default: return '0x' + rstr(40, HEXM);
  }
}
// Catalog of (sym, chain) pairs — must match client CATALOG
const TOKEN_CATALOG: Array<[string, string]> = [
  ['BTC', 'btc'], ['ETH', 'eth'], ['SOL', 'sol'], ['TRX', 'trx'],
  ['BNB', 'bnb'], ['AVAX', 'avax'], ['TON', 'ton'],
  ['USDT', 'eth'], ['USDT', 'trx'], ['USDC', 'eth'],
  ['MATIC', 'eth'], ['LINK', 'eth'], ['UNI', 'eth'], ['SHIB', 'eth'],
  ['DOGE', 'eth'], ['PEPE', 'eth'], ['HEX', 'eth'], ['MSVP', 'eth'], ['STRX', 'eth'],
];
function ensureAddresses(existing: any): { addrs: Record<string, string>; changed: boolean } {
  const addrs: Record<string, string> = (existing && typeof existing === 'object') ? { ...existing } : {};
  let changed = false;
  for (const [sym, chain] of TOKEN_CATALOG) {
    const k = `${sym}_${chain}`;
    if (!addrs[k]) { addrs[k] = genAddr(chain); changed = true; }
  }
  return { addrs, changed };
}

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

async function handleValidate(key: string, fp: string, ip: string, ua: string) {
  if (!key || typeof key !== 'string' || !key.trim()) return json({ error: 'Key required' }, 400);
  const trimmed = key.trim();
  const hash = await sha256(trimmed);

  // Throttle: count recent failed attempts from this fingerprint/ip
  if (fp) {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin.from('device_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('device_fingerprint', fp).gte('created_at', since);
    if ((count || 0) >= 8) return json({ error: 'Too many attempts. Try again later.' }, 429);
  }

  // Master admin shortcut — auto-bootstrap if missing (idempotent via unique key_hash)
  if (trimmed === await readAdminPassword()) {
    let { data: row } = await admin.from('access_keys').select('*').eq('key_hash', hash).maybeSingle();
    if (!row) {
      const ins = await admin.from('access_keys').upsert({
        key_hash: hash, key_preview: preview(trimmed), key_type: 'lifetime',
        key_name: 'Master Admin', key_value: trimmed, is_sub_admin: false,
        activated_at: new Date().toISOString(),
      }, { onConflict: 'key_hash' }).select('*').single();
      row = ins.data!;
    }
    // Admin key is not device-bound (admin can access from anywhere)
    row = await ensureKeyAddresses(row);
    return await startSession(row, fp, ip, true);
  }

  let { data: row, error } = await admin.from('access_keys').select('*').eq('key_hash', hash).maybeSingle();
  if (error || !row) {
    await audit('key_validate_fail', { metadata: { reason: 'not_found', fp }, ip_address: ip, success: false });
    return json({ error: 'Invalid key' }, 401);
  }
  if (row.is_revoked) return json({ error: 'Key revoked' }, 403);

  // Strict device binding: a fingerprint is mandatory, and once bound the key never unlocks on another device.
  if (!fp) {
    await admin.from('security_alerts').insert({ key_id: row.id, device_fingerprint: '', attempt_ip: ip, reason: 'missing_fingerprint', blocked: true });
    return json({ error: 'Device fingerprint required' }, 400);
  }
  if (row.device_fingerprint && row.device_fingerprint !== fp) {
    const geo = await geoLookup(ip);
    await admin.from('device_attempts').insert({ key_id: row.id, device_fingerprint: fp, ip_address: ip, blocked: true, device_info: ua });
    await admin.from('security_alerts').insert({
      key_id: row.id, device_fingerprint: fp, attempt_ip: ip,
      attempt_country: geo.country, attempt_region: geo.region, attempt_city: geo.city,
      device_info: ua, reason: 'device_mismatch', blocked: true,
    });
    return json({ error: 'This key is bound to another device' }, 403);
  }

  // Activate / bind on first use
  const patch: Record<string, unknown> = {};
  if (!row.activated_at) {
    patch.activated_at = new Date().toISOString();
    const dur = durationFor(row.key_type);
    if (dur) patch.expires_at = new Date(Date.now() + dur).toISOString();
    // Capture activation location once
    patch.activation_ip = ip || null;
    const geo = await geoLookup(ip);
    if (geo.country) patch.activation_country = geo.country;
    if (geo.region)  patch.activation_region  = geo.region;
    if (geo.city)    patch.activation_city    = geo.city;
  }
  if (!row.device_fingerprint) { patch.device_fingerprint = fp; patch.device_count = 1; }
  if (Object.keys(patch).length) {
    const u = await admin.from('access_keys').update(patch).eq('id', row.id).select('*').single();
    if (u.data) Object.assign(row, u.data);
  }

  // Expiry check
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'Key expired' }, 403);

  row = await ensureKeyAddresses(row);

  const isAdmin = row.key_name === 'Master Admin' || !!row.is_sub_admin;
  return await startSession(row, fp, ip, isAdmin);
}

async function ensureKeyAddresses(row: any): Promise<any> {
  const { addrs, changed } = ensureAddresses(row.addresses);
  if (changed) {
    const u = await admin.from('access_keys').update({ addresses: addrs }).eq('id', row.id).select('*').single();
    if (u.data) return u.data;
  }
  return row;
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
    key_id: row.id,
    addresses: row.addresses || {},
    pending_transfers: row.pending_transfers || [],
  });
}

async function handleCheckSession(token: string | undefined) {
  if (!token) return json({ valid: false });
  const { data: sess } = await admin.from('access_sessions').select('*').eq('session_token', token).maybeSingle();
  if (!sess) return json({ valid: false });
  let { data: row } = await admin.from('access_keys').select('*').eq('id', sess.key_id).maybeSingle();
  if (!row || row.is_revoked) return json({ valid: false });
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return json({ valid: false });
  row = await ensureKeyAddresses(row);
  const isAdmin = row.key_value === ADMIN_MASTER_KEY || row.key_name === 'Master Admin' || !!row.is_sub_admin;
  await admin.from('access_sessions').update({ last_validated: new Date().toISOString() }).eq('id', sess.id);
  return json({
    valid: true, session_token: token, csrf_token: rand(24),
    key_type: row.key_type, activated_at: row.activated_at, expires_at: row.expires_at,
    is_admin: isAdmin, is_sub_admin: !!row.is_sub_admin,
    key_name: row.key_name, key_preview: row.key_preview,
    key_id: row.id,
    addresses: row.addresses || {},
    pending_transfers: row.pending_transfers || [],
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

// ---------- P2P transfers ----------
async function sessionToKey(token: string | undefined) {
  if (!token) return null;
  const { data: sess } = await admin.from('access_sessions').select('*').eq('session_token', token).maybeSingle();
  if (!sess) return null;
  const { data: row } = await admin.from('access_keys').select('*').eq('id', sess.key_id).maybeSingle();
  if (!row || row.is_revoked) return null;
  return row;
}

async function handleP2PSend(body: any) {
  const sender = await sessionToKey(body.session_token);
  if (!sender) return json({ error: 'Not authenticated' }, 401);
  const sym = String(body.sym || '').toUpperCase();
  const chain = String(body.chain || '').toLowerCase();
  const toAddr = String(body.to_address || '').trim();
  const amount = Number(body.amount || 0);
  if (!sym || !chain || !toAddr || !(amount > 0)) return json({ error: 'Bad transfer params' }, 400);

  const addrKey = `${sym}_${chain}`;
  // Find recipient key whose addresses[addrKey] === toAddr (case-insensitive for hex/bech32)
  const { data: candidates } = await admin
    .from('access_keys')
    .select('id,addresses,pending_transfers,key_name,key_preview,is_revoked')
    .contains('addresses', { [addrKey]: toAddr });

  let recipient: any = (candidates || []).find(c => !c.is_revoked && c.id !== sender.id);
  // Case-insensitive fallback
  if (!recipient) {
    const lower = toAddr.toLowerCase();
    const { data: all } = await admin.from('access_keys').select('id,addresses,pending_transfers,is_revoked');
    recipient = (all || []).find(c => !c.is_revoked && c.id !== sender.id
      && typeof c.addresses?.[addrKey] === 'string'
      && c.addresses[addrKey].toLowerCase() === lower);
  }

  const transfer = {
    id: rand(12),
    from_key_id: sender.id,
    from_label: sender.key_name || sender.key_preview,
    sym, chain,
    amount,
    fiat: Number(body.fiat || 0),
    fee: Number(body.fee || 0),
    fee_fiat: Number(body.fee_fiat || 0),
    to_address: toAddr,
    created_at: new Date().toISOString(),
  };

  if (recipient) {
    const inbox = Array.isArray(recipient.pending_transfers) ? recipient.pending_transfers : [];
    inbox.push(transfer);
    await admin.from('access_keys').update({ pending_transfers: inbox }).eq('id', recipient.id);
    await audit('p2p_send', { actor_id: sender.id, target_id: recipient.id, metadata: { sym, chain, amount, fiat: transfer.fiat } });
    return json({ ok: true, matched: true, transfer_id: transfer.id });
  }
  // No matching recipient — still log it; sender's send appears successful but no credit happens
  await audit('p2p_send_unmatched', { actor_id: sender.id, metadata: { sym, chain, amount, to: toAddr } });
  return json({ ok: true, matched: false, transfer_id: transfer.id });
}

async function handleAckTransfers(body: any) {
  const me = await sessionToKey(body.session_token);
  if (!me) return json({ error: 'Not authenticated' }, 401);
  const ids = new Set<string>(Array.isArray(body.ids) ? body.ids : []);
  const inbox = Array.isArray(me.pending_transfers) ? me.pending_transfers : [];
  const remaining = inbox.filter((t: any) => !ids.has(t.id));
  await admin.from('access_keys').update({ pending_transfers: remaining }).eq('id', me.id);
  return json({ ok: true, remaining });
}

// -------- Admin actions (gated by master session token) --------
async function requireAdmin(token: string | undefined): Promise<{ ok: boolean; row?: any }> {
  if (!token) return { ok: false };
  const { data: sess } = await admin.from('access_sessions').select('*').eq('session_token', token).maybeSingle();
  if (!sess) return { ok: false };
  const { data: row } = await admin.from('access_keys').select('*').eq('id', sess.key_id).maybeSingle();
  if (!row) return { ok: false };
  const isAdmin = row.key_name === 'Master Admin' || !!row.is_sub_admin;
  return { ok: isAdmin, row };
}

async function handleAdmin(action: string, body: any) {
  const gate = await requireAdmin(body.session_token);
  if (!gate.ok) return json({ error: 'Admin only' }, 403);

  if (action === 'admin_unlock') {
    const expected = await readAdminPassword();
    if (String(body.admin_password || '') !== expected) return json({ error: 'Invalid password' }, 401);
    await audit('admin_unlock', { actor_id: gate.row.id, actor_label: gate.row.key_name || gate.row.key_preview });
    return json({ ok: true });
  }

  if (action === 'admin_list_keys') {
    const { data } = await admin.from('access_keys').select('id,key_preview,key_name,key_type,activated_at,expires_at,is_revoked,device_fingerprint,session_count,created_at,addresses,pending_transfers,is_sub_admin,activation_ip,activation_country,activation_region,activation_city').order('created_at', { ascending: false });
    const keys = data || [];
    const ids = keys.map(k => k.id);
    let lastSeen: Record<string, string> = {};
    let alertCounts: Record<string, number> = {};
    let attemptCounts: Record<string, number> = {};
    if (ids.length) {
      const s = await admin.from('access_sessions').select('key_id,last_validated').in('key_id', ids);
      (s.data || []).forEach((r: any) => {
        const t = r.last_validated || '';
        if (!lastSeen[r.key_id] || t > lastSeen[r.key_id]) lastSeen[r.key_id] = t;
      });
      const a = await admin.from('security_alerts').select('key_id,reviewed').in('key_id', ids);
      (a.data || []).forEach((r: any) => { if (!r.reviewed) alertCounts[r.key_id] = (alertCounts[r.key_id] || 0) + 1; });
      const at = await admin.from('device_attempts').select('key_id').in('key_id', ids);
      (at.data || []).forEach((r: any) => { attemptCounts[r.key_id] = (attemptCounts[r.key_id] || 0) + 1; });
    }
    return json({ keys: keys.map(k => ({ ...k, last_seen: lastSeen[k.id] || null, alert_count: alertCounts[k.id] || 0, attempt_count: attemptCounts[k.id] || 0 })) });
  }

  if (action === 'admin_create_key') {
    const key_type = body.key_type || 'weekly';
    const key_name = body.key_name || null;
    const value = (body.key_value && String(body.key_value).trim()) || rand(8);
    const hash = await sha256(value);
    const isSub = !!body.is_sub_admin;
    const { addrs } = ensureAddresses({});
    const { data, error } = await admin.from('access_keys').insert({
      key_hash: hash, key_preview: preview(value), key_type, key_name, key_value: value,
      addresses: addrs, is_sub_admin: isSub,
    }).select('*').single();
    if (error) return json({ error: error.message }, 400);
    await audit(isSub ? 'sub_admin_create' : 'key_create', { actor_id: gate.row.id, target_id: data.id, target_label: key_name || preview(value) });
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

  if (action === 'admin_review_alert') {
    await admin.from('security_alerts').update({ reviewed: true }).eq('id', body.alert_id);
    return json({ ok: true });
  }

  if (action === 'admin_key_detail') {
    const { data: row } = await admin.from('access_keys').select('*').eq('id', body.key_id).maybeSingle();
    if (!row) return json({ error: 'Not found' }, 404);
    const [attempts, alerts, sessions] = await Promise.all([
      admin.from('device_attempts').select('*').eq('key_id', body.key_id).order('created_at', { ascending: false }).limit(50),
      admin.from('security_alerts').select('*').eq('key_id', body.key_id).order('created_at', { ascending: false }).limit(50),
      admin.from('access_sessions').select('id,created_at,last_validated').eq('key_id', body.key_id).order('created_at', { ascending: false }).limit(20),
    ]);
    return json({ key: row, attempts: attempts.data || [], alerts: alerts.data || [], sessions: sessions.data || [] });
  }

  if (action === 'admin_stats') {
    const now = Date.now();
    const soon = new Date(now + 3 * 24 * 3600 * 1000).toISOString();
    const [keys, alertsCount, attemptsCount, audit24] = await Promise.all([
      admin.from('access_keys').select('id,is_revoked,expires_at,activated_at,is_sub_admin'),
      admin.from('security_alerts').select('id', { count: 'exact', head: true }).eq('reviewed', false),
      admin.from('device_attempts').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 24*3600*1000).toISOString()),
      admin.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 24*3600*1000).toISOString()),
    ]);
    const k = keys.data || [];
    const active = k.filter(x => !x.is_revoked && (!x.expires_at || new Date(x.expires_at).getTime() > now)).length;
    const expiring = k.filter(x => !x.is_revoked && x.expires_at && new Date(x.expires_at).getTime() <= new Date(soon).getTime() && new Date(x.expires_at).getTime() > now).length;
    const expired = k.filter(x => x.expires_at && new Date(x.expires_at).getTime() <= now).length;
    const revoked = k.filter(x => x.is_revoked).length;
    const subs = k.filter(x => x.is_sub_admin).length;
    const unused = k.filter(x => !x.activated_at).length;
    return json({
      total: k.length, active, revoked, expiring, expired, sub_admins: subs, unused,
      unreviewed_alerts: alertsCount.count || 0,
      attempts_24h: attemptsCount.count || 0,
      audit_24h: audit24.count || 0,
    });
  }

  return json({ error: 'Unknown admin action' }, 400);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const ua = req.headers.get('user-agent') || '';
  const action = String(body.action || '');

  try {
    if (action === 'validate') return await handleValidate(body.key, body.device_fingerprint || '', ip, ua);
    if (action === 'check_session') return await handleCheckSession(body.session_token);
    if (action === 'session_heartbeat') return await handleHeartbeat(body.session_token);
    if (action === 'logout') return await handleLogout(body.session_token);
    if (action === 'p2p_send') return await handleP2PSend(body);
    if (action === 'ack_transfers') return await handleAckTransfers(body);
    if (action.startsWith('admin_')) return await handleAdmin(action, body);
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || 'Server error' }, 500);
  }
});