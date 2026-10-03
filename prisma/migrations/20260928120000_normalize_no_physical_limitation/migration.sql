-- Preserve the official option for the UI; remove only its profile associations.
-- Migrations run before seeding on a fresh database, where the option is absent.
DO $$
DECLARE
  official_name TEXT;
  official_is_custom BOOLEAN;
BEGIN
  SELECT name, "isCustom" INTO official_name, official_is_custom
  FROM physical_limitations
  WHERE id = '09ab1d62-180a-4ba4-8b1e-836065ddab42';

  IF EXISTS (
    SELECT 1 FROM physical_limitations
    WHERE name = 'Nenhuma' AND id <> '09ab1d62-180a-4ba4-8b1e-836065ddab42'
  ) THEN
    RAISE EXCEPTION 'A opção Nenhuma possui ID inesperado; backfill interrompido';
  END IF;

  IF official_name IS NOT NULL THEN
    IF official_name <> 'Nenhuma' OR official_is_custom IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'A opção oficial Nenhuma não corresponde ao catálogo esperado; backfill interrompido';
    END IF;

    DELETE FROM profile_physical_limitations
    WHERE "physicalLimitationId" = '09ab1d62-180a-4ba4-8b1e-836065ddab42';
  END IF;
END $$;
