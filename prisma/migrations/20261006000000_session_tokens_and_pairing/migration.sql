-- Presence rows are transient (seconds-long); clear them so the new
-- NOT NULL token column can be added safely.
DELETE FROM "Presence";
DELETE FROM "Signal";

-- AlterTable
ALTER TABLE "Presence" ADD COLUMN "tokenHash" TEXT NOT NULL,
ADD COLUMN "peerId" TEXT,
ADD COLUMN "pendingTo" TEXT,
ADD COLUMN "lastRequestAt" TIMESTAMP(3);
