-- Ensure system_settings.name can be used safely with ON CONFLICT.
-- Some environments still rely on upsert(onConflict: 'name').

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_settings'
      AND column_name = 'name'
  ) THEN
    -- Keep one row per name before creating unique index.
    DELETE FROM public.system_settings a
    USING public.system_settings b
    WHERE a.name = b.name
      AND a.id > b.id;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_system_settings_name_unique
      ON public.system_settings (name);
  END IF;
END $$;
