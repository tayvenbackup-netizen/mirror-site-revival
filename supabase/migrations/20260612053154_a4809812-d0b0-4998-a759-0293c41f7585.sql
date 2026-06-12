ALTER TABLE public.key_groups ADD COLUMN IF NOT EXISTS is_reseller boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS key_groups_is_reseller_idx ON public.key_groups(is_reseller);
CREATE INDEX IF NOT EXISTS access_keys_group_id_idx ON public.access_keys(group_id);