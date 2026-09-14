BEGIN;

CREATE TYPE "WeeklyTrainingPlanSource" AS ENUM ('GENERATED', 'CUSTOM');
CREATE TYPE "TrainingDayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

CREATE TABLE "weekly_training_plans" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "source" "WeeklyTrainingPlanSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "weekly_training_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_training_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "weekly_training_days" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "dayOfWeek" "TrainingDayOfWeek" NOT NULL,
  "routineId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "weekly_training_days_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_training_days_planId_fkey" FOREIGN KEY ("planId") REFERENCES "weekly_training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "weekly_training_days_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "weekly_training_plans_userId_idx" ON "weekly_training_plans"("userId");
CREATE UNIQUE INDEX "weekly_training_plans_one_active_per_user_key" ON "weekly_training_plans"("userId") WHERE "isActive" = true;
CREATE UNIQUE INDEX "weekly_training_days_planId_dayOfWeek_key" ON "weekly_training_days"("planId", "dayOfWeek");
CREATE INDEX "weekly_training_days_routineId_idx" ON "weekly_training_days"("routineId");

-- Routine owners are already immutable. Protect the other side as well, so
-- an ownership update cannot invalidate existing days or race association.
CREATE FUNCTION protect_weekly_training_plan_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Weekly training plan owner is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER weekly_training_plan_owner_immutable BEFORE UPDATE OF "userId" ON "weekly_training_plans"
FOR EACH ROW EXECUTE FUNCTION protect_weekly_training_plan_owner();

CREATE FUNCTION validate_weekly_training_day() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_owner text; routine_owner text;
BEGIN
  SELECT "userId" INTO plan_owner FROM "weekly_training_plans" WHERE id = NEW."planId";
  SELECT "userId" INTO routine_owner FROM "routines" WHERE id = NEW."routineId";
  -- Missing parents are handled by FKs; owners cannot change, including concurrently.
  IF plan_owner IS NOT NULL AND routine_owner IS NOT NULL AND plan_owner <> routine_owner THEN
    RAISE EXCEPTION 'Routine must belong to the weekly training plan owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER weekly_training_day_integrity BEFORE INSERT OR UPDATE ON "weekly_training_days"
FOR EACH ROW EXECUTE FUNCTION validate_weekly_training_day();

-- No relation to workout_sessions: removing planning only removes planning.
COMMIT;
