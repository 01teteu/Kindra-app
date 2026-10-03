-- Existing reset challenges and JWTs have no grant and cannot authorize a reset.
ALTER TABLE "password_reset_tokens" ADD COLUMN "resetGrantId" TEXT;
