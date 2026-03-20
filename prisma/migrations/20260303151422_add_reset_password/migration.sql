-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetCodeExp" TIMESTAMP(3),
ADD COLUMN     "resetCodeHash" TEXT;
