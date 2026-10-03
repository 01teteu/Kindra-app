BEGIN;

-- Nullable because existing challenges have no provable delivery address. They
-- remain stored but must be reissued before they can verify an account.
ALTER TABLE "email_verification_tokens"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "issuedToEmail" TEXT;
ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_attempts_nonnegative" CHECK ("attempts" >= 0);

COMMIT;
