BEGIN;

-- Existing planning and history have no known exercise-level rest prescription.
-- Nullable columns preserve that absence; no inferred backfill or set changes.
ALTER TABLE "routine_exercises" ADD COLUMN "restTime" INTEGER;
ALTER TABLE "workout_exercises" ADD COLUMN "restTimeSnapshot" INTEGER;
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_restTime_check" CHECK ("restTime" >= 0);
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_restTimeSnapshot_check" CHECK ("restTimeSnapshot" >= 0);

CREATE FUNCTION protect_workout_exercise_rest_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."restTimeSnapshot" IS DISTINCT FROM OLD."restTimeSnapshot" THEN
    RAISE EXCEPTION 'Workout exercise planned rest snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workout_exercise_rest_snapshot_immutable BEFORE UPDATE OF "restTimeSnapshot" ON "workout_exercises"
FOR EACH ROW EXECUTE FUNCTION protect_workout_exercise_rest_snapshot();

COMMENT ON COLUMN "routine_exercises"."restTime" IS 'Planned rest in seconds; NULL unspecified; 0 no rest.';
COMMENT ON COLUMN "workout_exercises"."restTimeSnapshot" IS 'Planned rest copied at session start, independent of mutable Routine and WorkoutSet.restTime.';

-- All existing FKs and delete behavior, including weekly days and history, remain.
COMMIT;
