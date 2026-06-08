
CREATE TYPE public.key_type AS ENUM ('daily', '3day', 'weekly', 'monthly', 'lifetime');

CREATE TABLE public.access_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  key_type public.key_type NOT NULL,
  key_name TEXT,
  key_value TEXT,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  device_fingerprint TEXT,
  device_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  total_play_seconds INTEGER NOT NULL DEFAULT 0,
  group_id UUID,
  created_by UUID,
  is_sub_admin BOOLEAN NOT NULL DEFAULT false,
  activation_country TEXT,
  activation_region TEXT,
  activation_city TEXT,
  activation_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_access_keys_hash ON public.access_keys(key_hash);
GRANT ALL ON public.access_keys TO service_role;
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon access_keys" ON public.access_keys FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny auth access_keys" ON public.access_keys FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.key_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#1098FC',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.key_groups TO service_role;
ALTER TABLE public.key_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon key_groups" ON public.key_groups FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny auth key_groups" ON public.key_groups FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE public.access_keys
  ADD CONSTRAINT access_keys_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.key_groups(id) ON DELETE SET NULL;

CREATE TABLE public.access_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  session_token_hash TEXT,
  key_id UUID NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_validated TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_access_sessions_token ON public.access_sessions(session_token);
GRANT ALL ON public.access_sessions TO service_role;
ALTER TABLE public.access_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon access_sessions" ON public.access_sessions FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny auth access_sessions" ON public.access_sessions FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.key_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  session_token TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER NOT NULL DEFAULT 0
);
GRANT ALL ON public.key_sessions TO service_role;
ALTER TABLE public.key_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon key_sessions" ON public.key_sessions FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny auth key_sessions" ON public.key_sessions FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.device_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_info TEXT,
  ip_address TEXT,
  blocked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_attempts_key_id ON public.device_attempts(key_id);
GRANT ALL ON public.device_attempts TO service_role;
ALTER TABLE public.device_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon device_attempts" ON public.device_attempts FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny auth device_attempts" ON public.device_attempts FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type TEXT NOT NULL,
  actor_id UUID,
  actor_label TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  target_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  success BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon audit_logs" ON public.audit_logs FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny auth audit_logs" ON public.audit_logs FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_country TEXT,
  attempt_region TEXT,
  attempt_city TEXT,
  attempt_ip TEXT,
  device_fingerprint TEXT,
  device_info TEXT,
  reason TEXT NOT NULL DEFAULT 'foreign_location_and_device',
  blocked BOOLEAN NOT NULL DEFAULT true,
  reviewed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_security_alerts_key_id ON public.security_alerts (key_id);
GRANT ALL ON public.security_alerts TO service_role;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon security_alerts" ON public.security_alerts FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny auth security_alerts" ON public.security_alerts FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.app_settings (
  id TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon app_settings" ON public.app_settings FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny auth app_settings" ON public.app_settings FOR ALL TO authenticated USING (false) WITH CHECK (false);
