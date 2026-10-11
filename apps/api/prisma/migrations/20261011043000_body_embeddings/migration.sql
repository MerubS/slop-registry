-- Run 2 embedded "category:" and "path:" in front of every comment.
-- Those vectors clustered by directory. Clear them so the next cluster
-- call embeds the comment body and a short diff excerpt. The run 2 labels
-- stay. Ingest still does not clear bucket, category, reason, or embedding.

UPDATE "ReviewComment" SET "embedding" = NULL;

-- Evidence on a draft is the comments that state the rule. supportCount is
-- how many of those there are. prCount is how many pull requests they span.
ALTER TABLE "Invariant" ADD COLUMN "supportCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invariant" ADD COLUMN "prCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Invariant"
SET "supportCount" = "clusterSize"
WHERE "supportCount" = 0;
