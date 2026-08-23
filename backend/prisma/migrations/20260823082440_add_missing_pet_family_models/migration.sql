-- AlterTable
ALTER TABLE "FamilyConnection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FamilyTask" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "sex" TEXT,
    "dob" TEXT,
    "microchip" TEXT,
    "weight" TEXT,
    "height" TEXT,
    "coatType" TEXT,
    "colorMarkings" TEXT,
    "vaccines" JSONB NOT NULL DEFAULT '[]',
    "medications" JSONB NOT NULL DEFAULT '[]',
    "allergies" JSONB NOT NULL DEFAULT '[]',
    "vet" JSONB,
    "feeding" JSONB,
    "groomings" JSONB NOT NULL DEFAULT '[]',
    "exercises" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetReminder" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3),
    "notes" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "remindAt" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentMedication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "mealTime" TEXT,
    "parent" TEXT NOT NULL,
    "startDate" TEXT,
    "duration" TEXT,
    "doctor" TEXT,
    "notes" TEXT,
    "refillDate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentMedication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pet_userId_idx" ON "Pet"("userId");

-- CreateIndex
CREATE INDEX "PetReminder_petId_idx" ON "PetReminder"("petId");

-- CreateIndex
CREATE INDEX "PetReminder_userId_idx" ON "PetReminder"("userId");

-- CreateIndex
CREATE INDEX "PetReminder_remindAt_idx" ON "PetReminder"("remindAt");

-- CreateIndex
CREATE INDEX "FamilyItem_userId_idx" ON "FamilyItem"("userId");

-- CreateIndex
CREATE INDEX "FamilyItem_domain_idx" ON "FamilyItem"("domain");

-- CreateIndex
CREATE INDEX "FamilyItem_remindAt_idx" ON "FamilyItem"("remindAt");

-- CreateIndex
CREATE INDEX "ParentMedication_userId_idx" ON "ParentMedication"("userId");

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetReminder" ADD CONSTRAINT "PetReminder_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetReminder" ADD CONSTRAINT "PetReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyItem" ADD CONSTRAINT "FamilyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentMedication" ADD CONSTRAINT "ParentMedication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
