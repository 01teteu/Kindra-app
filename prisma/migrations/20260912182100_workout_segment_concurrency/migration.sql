BEGIN;
-- A SELECT FOR UPDATE serializes READ COMMITTED, but does not invalidate a
-- REPEATABLE READ snapshot after disjoint child writes. Create a parent row
-- version on every segment mutation so conflicting snapshots fail with 40001.
-- No domain value or timestamp is fabricated; id remains identical.
CREATE OR REPLACE FUNCTION protect_drop_set_segment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id text; parent_type "WorkoutSetType";
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."workoutSetId" IS DISTINCT FROM OLD."workoutSetId" THEN
    RAISE EXCEPTION 'Drop set segment parent is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN parent_id := OLD."workoutSetId";
  ELSE parent_id := NEW."workoutSetId"; END IF;
  UPDATE "workout_sets" SET "id" = "id" WHERE "id" = parent_id RETURNING "type" INTO parent_type;
  IF TG_OP <> 'DELETE' AND (NOT FOUND OR parent_type <> 'DROP_SET') THEN
    RAISE EXCEPTION 'Segments require a DROP_SET parent' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
COMMIT;
