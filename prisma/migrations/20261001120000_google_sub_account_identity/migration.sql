-- Google accounts are identified by the immutable subject, never by email.
-- Existing accounts deliberately remain unlinked until explicit verification.
ALTER TABLE "users" ADD COLUMN "googleSub" TEXT;
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");
