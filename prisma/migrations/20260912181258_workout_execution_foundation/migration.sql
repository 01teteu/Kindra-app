/*
  Warnings:

  - You are about to drop the column `isCompleted` on the `workout_sets` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[sessionId,order]` on the table `workout_exercises` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workoutExerciseId,setNumber]` on the table `workout_sets` will be added. If there are existing duplicate values, this will fail.

*/
-- Inspected local PostgreSQL on 2026-09-12: all three execution tables empty.
-- Legacy types/completion timestamps/status cannot be inferred safely elsewhere.
BEGIN;
LOCK TABLE "workout_sessions", "workout_exercises", "workout_sets" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "workout_sessions") OR
     EXISTS (SELECT 1 FROM "workout_exercises") OR
     EXISTS (SELECT 1 FROM "workout_sets") THEN
    RAISE EXCEPTION 'Legacy workout execution requires an explicitly reviewed backfill; migration aborted';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "WorkoutSetType" AS ENUM ('WARMUP', 'WORKING', 'DROP_SET');

-- CreateEnum
CREATE TYPE "WorkoutSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISCARDED');

-- DropIndex
DROP INDEX "workout_exercises_exerciseId_idx";

-- AlterTable
ALTER TABLE "workout_sessions" ADD COLUMN     "status" "WorkoutSessionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "workout_sets" DROP COLUMN "isCompleted",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "type" "WorkoutSetType" NOT NULL DEFAULT 'WORKING',
ALTER COLUMN "reps" DROP NOT NULL,
ALTER COLUMN "reps" DROP DEFAULT,
ALTER COLUMN "weight" DROP NOT NULL,
ALTER COLUMN "weight" DROP DEFAULT;

-- CreateTable
CREATE TABLE "drop_set_segments" (
    "id" TEXT NOT NULL,
    "workoutSetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "drop_set_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drop_set_segments_workoutSetId_order_key" ON "drop_set_segments"("workoutSetId", "order");

-- CreateIndex
CREATE INDEX "workout_exercises_exerciseId_sessionId_idx" ON "workout_exercises"("exerciseId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "workout_exercises_sessionId_order_key" ON "workout_exercises"("sessionId", "order");

-- CreateIndex
CREATE INDEX "workout_sessions_userId_startedAt_idx" ON "workout_sessions"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "workout_sessions_routineId_idx" ON "workout_sessions"("routineId");

-- CreateIndex
CREATE UNIQUE INDEX "workout_sets_workoutExerciseId_setNumber_key" ON "workout_sets"("workoutExerciseId", "setNumber");

-- AddForeignKey
ALTER TABLE "drop_set_segments" ADD CONSTRAINT "drop_set_segments_workoutSetId_fkey" FOREIGN KEY ("workoutSetId") REFERENCES "workout_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma 5 does not represent partial indexes, CHECKs or these triggers.
CREATE UNIQUE INDEX "workout_sessions_one_active_per_user_key"
  ON "workout_sessions" ("userId") WHERE "status" = 'ACTIVE';

ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_lifecycle_check" CHECK (
  ("status" = 'ACTIVE' AND "endedAt" IS NULL) OR
  ("status" IN ('COMPLETED', 'DISCARDED') AND "endedAt" IS NOT NULL AND "endedAt" >= "startedAt")
);
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_order_check" CHECK ("order" >= 0);
ALTER TABLE "workout_sets"
  ADD CONSTRAINT "workout_sets_number_check" CHECK ("setNumber" >= 1),
  ADD CONSTRAINT "workout_sets_reps_check" CHECK ("reps" >= 0),
  ADD CONSTRAINT "workout_sets_weight_check" CHECK ("weight" >= 0 AND "weight" < 'Infinity'::float8),
  ADD CONSTRAINT "workout_sets_rest_check" CHECK ("restTime" >= 0),
  ADD CONSTRAINT "workout_sets_drop_values_check" CHECK ("type" <> 'DROP_SET' OR ("weight" IS NULL AND "reps" IS NULL));
ALTER TABLE "drop_set_segments"
  ADD CONSTRAINT "drop_set_segments_order_check" CHECK ("order" >= 0),
  ADD CONSTRAINT "drop_set_segments_reps_check" CHECK ("reps" >= 0),
  ADD CONSTRAINT "drop_set_segments_weight_check" CHECK ("weight" >= 0 AND "weight" < 'Infinity'::float8);

-- Routine ownership is identity. Immutability also closes the reverse update race.
CREATE FUNCTION protect_workout_routine_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Routine owner is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER routine_owner_immutable BEFORE UPDATE OF "userId" ON "routines"
FOR EACH ROW EXECUTE FUNCTION protect_workout_routine_owner();

CREATE FUNCTION validate_workout_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE routine_owner text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
      RAISE EXCEPTION 'Workout session owner is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD."status" <> 'ACTIVE' AND NEW."status" = 'ACTIVE' THEN
      RAISE EXCEPTION 'Ended workout session cannot become active again' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."routineId" IS NOT NULL THEN
    SELECT "userId" INTO routine_owner FROM "routines" WHERE "id" = NEW."routineId" FOR SHARE;
    IF NOT FOUND OR routine_owner <> NEW."userId" THEN
      RAISE EXCEPTION 'Routine must belong to the workout session owner' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workout_session_integrity BEFORE INSERT OR UPDATE ON "workout_sessions"
FOR EACH ROW EXECUTE FUNCTION validate_workout_session();

CREATE FUNCTION protect_workout_set_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workoutExerciseId" IS DISTINCT FROM OLD."workoutExerciseId" THEN
    RAISE EXCEPTION 'Workout set parent is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workout_set_parent_immutable BEFORE UPDATE OF "workoutExerciseId" ON "workout_sets"
FOR EACH ROW EXECUTE FUNCTION protect_workout_set_parent();

-- All segment mutations serialize on the logical set, including DELETE.
-- This prevents concurrent segment edits from racing parent completion/type edits.
CREATE FUNCTION protect_drop_set_segment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id text; parent_type "WorkoutSetType";
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."workoutSetId" IS DISTINCT FROM OLD."workoutSetId" THEN
    RAISE EXCEPTION 'Drop set segment parent is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN parent_id := OLD."workoutSetId";
  ELSE parent_id := NEW."workoutSetId"; END IF;
  SELECT "type" INTO parent_type FROM "workout_sets" WHERE "id" = parent_id FOR UPDATE;
  IF TG_OP <> 'DELETE' AND (NOT FOUND OR parent_type <> 'DROP_SET') THEN
    RAISE EXCEPTION 'Segments require a DROP_SET parent' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER drop_set_segment_integrity BEFORE INSERT OR UPDATE OR DELETE ON "drop_set_segments"
FOR EACH ROW EXECUTE FUNCTION protect_drop_set_segment();

-- Check the final transaction state: supports nested creates and atomic completion.
-- In-progress drops may have 0/1 segments; completed drops need >=2, all completed
-- no later than the logical set. No weight-decrease rule or physiological bounds.
CREATE FUNCTION validate_drop_set_completion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id text; parent_record "workout_sets"%ROWTYPE; segment_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'workout_sets' THEN parent_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN parent_id := OLD."workoutSetId";
  ELSE parent_id := NEW."workoutSetId"; END IF;
  SELECT * INTO parent_record FROM "workout_sets" WHERE "id" = parent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF; -- Normal parent/user cascade.
  SELECT count(*) INTO segment_count FROM "drop_set_segments" WHERE "workoutSetId" = parent_id;
  IF parent_record."type" <> 'DROP_SET' AND segment_count > 0 THEN
    RAISE EXCEPTION 'Simple sets cannot have drop segments' USING ERRCODE = '23514';
  END IF;
  IF parent_record."type" = 'DROP_SET' AND parent_record."completedAt" IS NOT NULL AND (
    segment_count < 2 OR EXISTS (
      SELECT 1 FROM "drop_set_segments" WHERE "workoutSetId" = parent_id AND
        ("completedAt" IS NULL OR "completedAt" > parent_record."completedAt")
    )
  ) THEN
    RAISE EXCEPTION 'Completed DROP_SET requires at least two completed segments, no later than its completion' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER workout_set_drop_completion AFTER INSERT OR UPDATE ON "workout_sets"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_drop_set_completion();
CREATE CONSTRAINT TRIGGER drop_set_segment_completion AFTER INSERT OR UPDATE OR DELETE ON "drop_set_segments"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_drop_set_completion();

COMMENT ON COLUMN "workout_sets"."restTime" IS 'Planned rest in seconds after the logical set; 0 means no planned rest. Not elapsed rest.';
COMMENT ON COLUMN "workout_sets"."completedAt" IS 'Canonical logical set completion; isCompleted is derived, not stored.';
COMMENT ON COLUMN "workout_sessions"."volumeTotal" IS 'Future cache, not automatically maintained: compatible completed WORKING sets + completed DROP_SET segments; exclude WARMUP and DROP_SET parent. Use measurementTypeSnapshot; weight * reps is not universal.';
COMMIT;
