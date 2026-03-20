-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailCodeExp" TIMESTAMP(3),
ADD COLUMN     "emailCodeHash" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;
