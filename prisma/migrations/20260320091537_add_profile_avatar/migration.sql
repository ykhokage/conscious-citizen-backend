/*
  Warnings:

  - You are about to drop the column `publicId` on the `Photo` table. All the data in the column will be lost.
  - You are about to drop the column `avatarPublicId` on the `Profile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Photo" DROP COLUMN "publicId",
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "avatarPublicId",
ADD COLUMN     "avatarStorageKey" TEXT;
