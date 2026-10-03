BEGIN;

-- Existing sessions predate this claim and are treated as version 0 until the
-- account's first successful password reset increments the persisted version.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD CONSTRAINT "users_sessionVersion_nonnegative" CHECK ("sessionVersion" >= 0);

COMMENT ON COLUMN "users"."sessionVersion" IS 'Incremented to revoke all previously issued session JWTs.';

COMMIT;
