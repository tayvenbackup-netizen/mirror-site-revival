
ALTER TABLE public.access_keys
  ADD COLUMN IF NOT EXISTS addresses jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_transfers jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_keys_hash_unique ON public.access_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_access_keys_addresses ON public.access_keys USING gin (addresses);
