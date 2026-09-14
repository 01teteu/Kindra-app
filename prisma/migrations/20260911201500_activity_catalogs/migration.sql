-- Inspected local database: no exercises or workout history on 2026-09-11.
-- No inferred name matching or destructive fallback is permitted on another database.
BEGIN;
LOCK TABLE "exercises" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "exercises") THEN
    RAISE EXCEPTION 'Legacy exercises require an explicitly reviewed ID-preserving backfill; migration aborted';
  END IF;
END $$;
-- CreateEnum
CREATE TYPE "ExerciseOrigin" AS ENUM ('GLOBAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExerciseMeasurementType" AS ENUM ('WEIGHT_REPS', 'REPS_ONLY', 'TIME', 'DISTANCE_TIME');

-- CreateEnum
CREATE TYPE "CardioMeasurementType" AS ENUM ('DISTANCE_TIME', 'REPS_ONLY', 'TIME');

-- CreateEnum
CREATE TYPE "SportMeasurementType" AS ENUM ('DURATION', 'DISTANCE_TIME', 'ROUNDS_TIME');

-- CreateEnum
CREATE TYPE "ExerciseLaterality" AS ENUM ('BILATERAL', 'UNILATERAL', 'ALTERNATING');

-- CreateEnum
CREATE TYPE "SportEnvironment" AS ENUM ('INDOOR', 'OUTDOOR', 'MIXED', 'WATER');

-- CreateEnum
CREATE TYPE "SportParticipantMode" AS ENUM ('INDIVIDUAL', 'DUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "EnergyProfileDomain" AS ENUM ('STRENGTH', 'CARDIO', 'SPORT');

-- CreateEnum
CREATE TYPE "EnergySourceMode" AS ENUM ('DIRECT_OR_CLOSE_MATCH', 'DERIVED');

-- DropForeignKey
ALTER TABLE "routine_exercises" DROP CONSTRAINT "routine_exercises_exerciseId_fkey";

-- DropForeignKey
ALTER TABLE "workout_exercises" DROP CONSTRAINT "workout_exercises_exerciseId_fkey";

-- AlterTable
ALTER TABLE "exercises" DROP COLUMN "isCustom",
DROP COLUMN "targetMuscle",
ADD COLUMN     "aliases" TEXT[],
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "laterality" "ExerciseLaterality",
ADD COLUMN     "measurementType" "ExerciseMeasurementType" NOT NULL,
ADD COLUMN     "movementPattern" TEXT,
ADD COLUMN     "muscleRegion" TEXT,
ADD COLUMN     "origin" "ExerciseOrigin" NOT NULL,
ADD COLUMN     "primaryMuscle" TEXT NOT NULL,
ADD COLUMN     "secondaryMuscles" TEXT[],
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "workout_exercises" ADD COLUMN     "equipmentSnapshot" TEXT NOT NULL,
ADD COLUMN     "exerciseNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "measurementTypeSnapshot" "ExerciseMeasurementType" NOT NULL,
ADD COLUMN     "primaryMuscleSnapshot" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "cardio_activities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[],
    "category" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "measurementType" "CardioMeasurementType" NOT NULL,
    "instructions" TEXT NOT NULL,
    "supportsDuration" BOOLEAN NOT NULL,
    "supportsDistance" BOOLEAN NOT NULL,
    "supportsPace" BOOLEAN NOT NULL,
    "supportsSpeed" BOOLEAN NOT NULL,
    "supportsHeartRate" BOOLEAN NOT NULL,
    "supportsIncline" BOOLEAN NOT NULL,
    "supportsResistance" BOOLEAN NOT NULL,
    "supportsReps" BOOLEAN NOT NULL,
    "thumbnailUrl" TEXT,
    "videoUrl" TEXT,
    "energyProfileId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cardio_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[],
    "category" TEXT NOT NULL,
    "environment" "SportEnvironment" NOT NULL,
    "participantMode" "SportParticipantMode" NOT NULL,
    "measurementType" "SportMeasurementType" NOT NULL,
    "description" TEXT NOT NULL,
    "supportsDuration" BOOLEAN NOT NULL,
    "supportsDistance" BOOLEAN NOT NULL,
    "supportsHeartRate" BOOLEAN NOT NULL,
    "supportsRounds" BOOLEAN NOT NULL,
    "supportsScore" BOOLEAN NOT NULL,
    "thumbnailUrl" TEXT,
    "videoUrl" TEXT,
    "energyProfileId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" "EnergyProfileDomain" NOT NULL,
    "metLight" DOUBLE PRECISION NOT NULL,
    "metModerate" DOUBLE PRECISION NOT NULL,
    "metVigorous" DOUBLE PRECISION NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceMode" "EnergySourceMode" NOT NULL,
    "sourceNote" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "energy_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cardio_activities_slug_key" ON "cardio_activities"("slug");

-- CreateIndex
CREATE INDEX "cardio_activities_energyProfileId_idx" ON "cardio_activities"("energyProfileId");

-- CreateIndex
CREATE INDEX "cardio_activities_category_isActive_idx" ON "cardio_activities"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "sports_slug_key" ON "sports"("slug");

-- CreateIndex
CREATE INDEX "sports_energyProfileId_idx" ON "sports"("energyProfileId");

-- CreateIndex
CREATE INDEX "sports_category_isActive_idx" ON "sports"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "energy_profiles_slug_key" ON "energy_profiles"("slug");

-- CreateIndex
CREATE INDEX "energy_profiles_domain_isActive_idx" ON "energy_profiles"("domain", "isActive");

-- CreateIndex
CREATE INDEX "exercises_origin_isActive_primaryMuscle_idx" ON "exercises"("origin", "isActive", "primaryMuscle");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_userId_slug_key" ON "exercises"("userId", "slug");

-- CreateIndex
CREATE INDEX "routine_exercises_exerciseId_idx" ON "routine_exercises"("exerciseId");

-- CreateIndex
CREATE INDEX "workout_exercises_exerciseId_idx" ON "workout_exercises"("exerciseId");

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "cardio_activities" ADD CONSTRAINT "cardio_activities_energyProfileId_fkey" FOREIGN KEY ("energyProfileId") REFERENCES "energy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports" ADD CONSTRAINT "sports_energyProfileId_fkey" FOREIGN KEY ("energyProfileId") REFERENCES "energy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma 5 cannot express partial uniqueness, CHECKs, triggers or deferrability.
CREATE UNIQUE INDEX "exercises_global_slug_key" ON "exercises" ("slug") WHERE "origin" = 'GLOBAL';
ALTER TABLE "exercises"
  ALTER COLUMN "aliases" SET NOT NULL,
  ALTER COLUMN "secondaryMuscles" SET NOT NULL,
  ADD CONSTRAINT "exercises_ownership_check" CHECK (
    ("origin" = 'GLOBAL' AND "userId" IS NULL) OR
    ("origin" = 'CUSTOM' AND "userId" IS NOT NULL)
  ),
  ADD CONSTRAINT "exercises_global_fields_check" CHECK (
    "origin" <> 'GLOBAL' OR (
      "muscleRegion" IS NOT NULL AND length(btrim("muscleRegion")) > 0 AND
      "movementPattern" IS NOT NULL AND length(btrim("movementPattern")) > 0 AND
      "laterality" IS NOT NULL AND
      "instructions" IS NOT NULL AND length(btrim("instructions")) > 0
    )
  ),
  ADD CONSTRAINT "exercises_required_text_check" CHECK (
    length(btrim("primaryMuscle")) > 0 AND length(btrim("equipment")) > 0
  );
ALTER TABLE "cardio_activities" ALTER COLUMN "aliases" SET NOT NULL;
ALTER TABLE "sports" ALTER COLUMN "aliases" SET NOT NULL;
ALTER TABLE "energy_profiles" ADD CONSTRAINT "energy_profiles_met_check" CHECK (
  "metLight" > 0 AND "metLight" < 'Infinity'::float8 AND
  "metModerate" > 0 AND "metModerate" < 'Infinity'::float8 AND
  "metVigorous" > 0 AND "metVigorous" < 'Infinity'::float8 AND
  "metLight" <= "metModerate" AND "metModerate" <= "metVigorous"
);

-- Origin and ownership define identity, never an editable catalog attribute.
CREATE FUNCTION protect_exercise_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."origin" IS DISTINCT FROM OLD."origin" OR NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Exercise origin and owner are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exercises_ownership_immutable BEFORE UPDATE ON "exercises"
FOR EACH ROW EXECUTE FUNCTION protect_exercise_ownership();

-- Child FK existence is insufficient: CARDIO and SPORT must match their parent domain.
-- SHARE locks serialize validation with domain changes, including concurrent transactions.
CREATE FUNCTION validate_activity_energy_domain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_domain "EnergyProfileDomain";
BEGIN
  SELECT "domain" INTO actual_domain FROM "energy_profiles"
    WHERE "id" = NEW."energyProfileId" FOR SHARE;
  IF NOT FOUND OR actual_domain::text <> TG_ARGV[0] THEN
    RAISE EXCEPTION 'Missing or incompatible EnergyProfile domain' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cardio_energy_domain BEFORE INSERT OR UPDATE OF "energyProfileId" ON "cardio_activities"
FOR EACH ROW EXECUTE FUNCTION validate_activity_energy_domain('CARDIO');
CREATE TRIGGER sport_energy_domain BEFORE INSERT OR UPDATE OF "energyProfileId" ON "sports"
FOR EACH ROW EXECUTE FUNCTION validate_activity_energy_domain('SPORT');

-- Validate the reverse direction too: referenced parents cannot change incompatibly.
CREATE FUNCTION protect_energy_profile_domain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."domain" IS DISTINCT FROM OLD."domain" AND (
    (NEW."domain" <> 'CARDIO' AND EXISTS (SELECT 1 FROM "cardio_activities" WHERE "energyProfileId" = OLD."id")) OR
    (NEW."domain" <> 'SPORT' AND EXISTS (SELECT 1 FROM "sports" WHERE "energyProfileId" = OLD."id"))
  ) THEN
    RAISE EXCEPTION 'EnergyProfile domain conflicts with existing activities' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER energy_profile_domain BEFORE UPDATE OF "domain" ON "energy_profiles"
FOR EACH ROW EXECUTE FUNCTION protect_energy_profile_domain();

-- Session identity is a snapshot, never a live projection of the mutable catalog.
-- This also rejects private exercises belonging to another session owner.
CREATE FUNCTION capture_workout_exercise_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE exercise_record "exercises"%ROWTYPE; session_owner text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO exercise_record FROM "exercises" WHERE "id" = NEW."exerciseId" FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Exercise not found' USING ERRCODE = '23503'; END IF;
    SELECT "userId" INTO session_owner FROM "workout_sessions" WHERE "id" = NEW."sessionId";
    IF NOT FOUND OR NOT exercise_record."isActive" OR
      (exercise_record."origin" = 'CUSTOM' AND exercise_record."userId" <> session_owner) THEN
      RAISE EXCEPTION 'Exercise unavailable to this session' USING ERRCODE = '23514';
    END IF;
    NEW."exerciseNameSnapshot" := exercise_record."name";
    NEW."primaryMuscleSnapshot" := exercise_record."primaryMuscle";
    NEW."equipmentSnapshot" := exercise_record."equipment";
    NEW."measurementTypeSnapshot" := exercise_record."measurementType";
  ELSIF NEW."exerciseId" IS DISTINCT FROM OLD."exerciseId" OR NEW."sessionId" IS DISTINCT FROM OLD."sessionId" OR
    NEW."exerciseNameSnapshot" IS DISTINCT FROM OLD."exerciseNameSnapshot" OR
    NEW."primaryMuscleSnapshot" IS DISTINCT FROM OLD."primaryMuscleSnapshot" OR
    NEW."equipmentSnapshot" IS DISTINCT FROM OLD."equipmentSnapshot" OR
    NEW."measurementTypeSnapshot" IS DISTINCT FROM OLD."measurementTypeSnapshot" THEN
    RAISE EXCEPTION 'Workout exercise identity and snapshot are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workout_exercise_snapshot BEFORE INSERT OR UPDATE ON "workout_exercises"
FOR EACH ROW EXECUTE FUNCTION capture_workout_exercise_snapshot();
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 ADD CONSTRAINT "exercises_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "cardio_activities" ADD CONSTRAINT "cardio_activities_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 ADD CONSTRAINT "cardio_activities_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "sports" ADD CONSTRAINT "sports_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 ADD CONSTRAINT "sports_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "energy_profiles" ADD CONSTRAINT "energy_profiles_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 ADD CONSTRAINT "energy_profiles_name_check" CHECK (length(btrim("name")) > 0);
COMMIT;
