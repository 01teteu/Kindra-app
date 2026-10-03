-- Individual session revocation; existing users and JWTs need no backfill.
CREATE TABLE "revoked_session_tokens" (
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "revoked_session_tokens_pkey" PRIMARY KEY ("tokenHash"),
    CONSTRAINT "revoked_session_tokens_hash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "revoked_session_tokens_userId_idx" ON "revoked_session_tokens"("userId");
CREATE INDEX "revoked_session_tokens_expiresAt_idx" ON "revoked_session_tokens"("expiresAt");

ALTER TABLE "revoked_session_tokens" ADD CONSTRAINT "revoked_session_tokens_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
