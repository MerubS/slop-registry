-- Thread replies were stored as ordinary comments, then classified as if
-- they were the review. GitHub's in_reply_to_id says which ones are replies.
-- The diff hunk is the code the comment sits on. Classify reads both.
--
-- The first aviator-co/av run labeled and embedded rows with the old prompt
-- and with the comment body alone. Those cached values would skip the new
-- prompt and the category/path prefix, so this migration clears them once.
-- Later ingests still do not touch bucket, category, reason, or embedding.

ALTER TABLE "ReviewComment" ADD COLUMN "inReplyToId" BIGINT;
ALTER TABLE "ReviewComment" ADD COLUMN "diffHunk" TEXT;

UPDATE "ReviewComment"
SET "bucket" = NULL,
    "category" = NULL,
    "reason" = NULL,
    "embedding" = NULL;
