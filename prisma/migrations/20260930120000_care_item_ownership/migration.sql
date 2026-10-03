-- Private care options belong to the user who selected them. Shared legacy
-- options are copied once per user; unlinked legacy options are discarded.
BEGIN;
LOCK TABLE profiles, profile_allergies, profile_physical_limitations,
  allergies, physical_limitations IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM physical_limitations
    WHERE id = '09ab1d62-180a-4ba4-8b1e-836065ddab42'
      AND (name <> 'Nenhuma' OR "isCustom" <> false)
  ) OR EXISTS (
    SELECT 1 FROM profile_physical_limitations
    WHERE "physicalLimitationId" = '09ab1d62-180a-4ba4-8b1e-836065ddab42'
  ) THEN
    RAISE EXCEPTION 'Opção oficial Nenhuma inconsistente; migration interrompida';
  END IF;
END $$;

ALTER TABLE allergies ADD COLUMN "ownerId" TEXT;
ALTER TABLE physical_limitations ADD COLUMN "ownerId" TEXT;

-- Snapshot every visible selection, including official options.
CREATE TEMP TABLE aud04_before_allergies ON COMMIT DROP AS
  SELECT pa."profileId", a.name
  FROM profile_allergies pa JOIN allergies a ON a.id = pa."allergyId";
CREATE TEMP TABLE aud04_before_limitations ON COMMIT DROP AS
  SELECT pl."profileId", l.name
  FROM profile_physical_limitations pl
  JOIN physical_limitations l ON l.id = pl."physicalLimitationId";

CREATE TEMP TABLE aud04_allergy_owners ON COMMIT DROP AS
  SELECT DISTINCT a.id, p."userId"
  FROM allergies a JOIN profile_allergies pa ON pa."allergyId" = a.id
  JOIN profiles p ON p.id = pa."profileId"
  WHERE a."isCustom";
CREATE TEMP TABLE aud04_allergy_counts ON COMMIT DROP AS
  SELECT a.id, COUNT(o."userId")::INTEGER AS owners
  FROM allergies a LEFT JOIN aud04_allergy_owners o ON o.id = a.id
  WHERE a."isCustom" GROUP BY a.id;
UPDATE allergies a SET "ownerId" = o."userId"
FROM aud04_allergy_counts c JOIN aud04_allergy_owners o ON o.id = c.id
WHERE a.id = c.id AND c.owners = 1;
CREATE TEMP TABLE aud04_allergy_copies ON COMMIT DROP AS
  SELECT c.id AS old_id, o."userId" AS owner_id, gen_random_uuid()::TEXT AS new_id
  FROM aud04_allergy_counts c JOIN aud04_allergy_owners o ON o.id = c.id
  WHERE c.owners > 1;
DROP INDEX "allergies_name_key";
INSERT INTO allergies (id, name, "isCustom", "ownerId")
  SELECT m.new_id, a.name, true, m.owner_id
  FROM aud04_allergy_copies m JOIN allergies a ON a.id = m.old_id;
UPDATE profile_allergies pa SET "allergyId" = m.new_id
FROM aud04_allergy_copies m, profiles p
WHERE pa."allergyId" = m.old_id
  AND p.id = pa."profileId" AND p."userId" = m.owner_id;

CREATE TEMP TABLE aud04_limitation_owners ON COMMIT DROP AS
  SELECT DISTINCT l.id, p."userId"
  FROM physical_limitations l
  JOIN profile_physical_limitations pl ON pl."physicalLimitationId" = l.id
  JOIN profiles p ON p.id = pl."profileId"
  WHERE l."isCustom";
CREATE TEMP TABLE aud04_limitation_counts ON COMMIT DROP AS
  SELECT l.id, COUNT(o."userId")::INTEGER AS owners
  FROM physical_limitations l LEFT JOIN aud04_limitation_owners o ON o.id = l.id
  WHERE l."isCustom" GROUP BY l.id;
UPDATE physical_limitations l SET "ownerId" = o."userId"
FROM aud04_limitation_counts c JOIN aud04_limitation_owners o ON o.id = c.id
WHERE l.id = c.id AND c.owners = 1;
CREATE TEMP TABLE aud04_limitation_copies ON COMMIT DROP AS
  SELECT c.id AS old_id, o."userId" AS owner_id, gen_random_uuid()::TEXT AS new_id
  FROM aud04_limitation_counts c JOIN aud04_limitation_owners o ON o.id = c.id
  WHERE c.owners > 1;
DROP INDEX "physical_limitations_name_key";
INSERT INTO physical_limitations (id, name, "isCustom", "ownerId")
  SELECT m.new_id, l.name, true, m.owner_id
  FROM aud04_limitation_copies m JOIN physical_limitations l ON l.id = m.old_id;
UPDATE profile_physical_limitations pl SET "physicalLimitationId" = m.new_id
FROM aud04_limitation_copies m, profiles p
WHERE pl."physicalLimitationId" = m.old_id
  AND p.id = pl."profileId" AND p."userId" = m.owner_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM profile_allergies pa
    JOIN aud04_allergy_counts c ON c.id = pa."allergyId" WHERE c.owners > 1
  ) OR EXISTS (
    SELECT 1 FROM profile_physical_limitations pl
    JOIN aud04_limitation_counts c ON c.id = pl."physicalLimitationId"
    WHERE c.owners > 1
  ) THEN
    RAISE EXCEPTION 'Vínculo com opção compartilhada não foi migrado';
  END IF;
END $$;

-- B: remove shared originals after all links have moved. C: remove orphans.
DELETE FROM allergies a USING aud04_allergy_counts c
  WHERE a.id = c.id AND c.owners <> 1;
DELETE FROM physical_limitations l USING aud04_limitation_counts c
  WHERE l.id = c.id AND c.owners <> 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM allergies WHERE "isCustom" IS DISTINCT FROM ("ownerId" IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM physical_limitations
    WHERE "isCustom" IS DISTINCT FROM ("ownerId" IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM profile_allergies pa JOIN allergies a ON a.id = pa."allergyId"
    JOIN profiles p ON p.id = pa."profileId"
    WHERE a."isCustom" AND a."ownerId" <> p."userId"
  ) OR EXISTS (
    SELECT 1 FROM profile_physical_limitations pl
    JOIN physical_limitations l ON l.id = pl."physicalLimitationId"
    JOIN profiles p ON p.id = pl."profileId"
    WHERE l."isCustom" AND l."ownerId" <> p."userId"
  ) THEN
    RAISE EXCEPTION 'Invariante de ownership violada; migration interrompida';
  END IF;
  IF EXISTS (
    WITH before_rows AS (
      SELECT "profileId", name, COUNT(*) AS n
      FROM aud04_before_allergies GROUP BY "profileId", name
    ), after_rows AS (
      SELECT pa."profileId", a.name, COUNT(*) AS n
      FROM profile_allergies pa JOIN allergies a ON a.id = pa."allergyId"
      GROUP BY pa."profileId", a.name
    )
    SELECT 1 FROM before_rows b FULL JOIN after_rows a
      ON a."profileId" = b."profileId" AND a.name = b.name
    WHERE b.n IS DISTINCT FROM a.n
  ) OR EXISTS (
    WITH before_rows AS (
      SELECT "profileId", name, COUNT(*) AS n
      FROM aud04_before_limitations GROUP BY "profileId", name
    ), after_rows AS (
      SELECT pl."profileId", l.name, COUNT(*) AS n
      FROM profile_physical_limitations pl
      JOIN physical_limitations l ON l.id = pl."physicalLimitationId"
      GROUP BY pl."profileId", l.name
    )
    SELECT 1 FROM before_rows b FULL JOIN after_rows a
      ON a."profileId" = b."profileId" AND a.name = b.name
    WHERE b.n IS DISTINCT FROM a.n
  ) THEN
    RAISE EXCEPTION 'Seleções visíveis mudaram; migration interrompida';
  END IF;
END $$;

ALTER TABLE allergies
  ADD CONSTRAINT "allergies_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "allergies_custom_owner_check"
    CHECK ("isCustom" = ("ownerId" IS NOT NULL));
ALTER TABLE physical_limitations
  ADD CONSTRAINT "physical_limitations_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "physical_limitations_custom_owner_check"
    CHECK ("isCustom" = ("ownerId" IS NOT NULL));
CREATE UNIQUE INDEX "allergies_ownerId_name_key" ON allergies("ownerId", name);
CREATE UNIQUE INDEX "allergies_official_name_key" ON allergies(name) WHERE "isCustom" = false;
CREATE UNIQUE INDEX "physical_limitations_ownerId_name_key"
  ON physical_limitations("ownerId", name);
CREATE UNIQUE INDEX "physical_limitations_official_name_key"
  ON physical_limitations(name) WHERE "isCustom" = false;
COMMIT;
