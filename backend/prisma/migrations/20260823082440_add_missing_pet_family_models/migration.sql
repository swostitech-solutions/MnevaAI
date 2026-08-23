-- AlterTable
ALTER TABLE "FamilyConnection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FamilyTask" ALTER COLUMN "updatedAt" DROP DEFAULT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Pet') THEN
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
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PetReminder') THEN
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
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'FamilyItem') THEN
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
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ParentMedication') THEN
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
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pet_userId_idx" ON "Pet"("userId");
CREATE INDEX IF NOT EXISTS "PetReminder_petId_idx" ON "PetReminder"("petId");
CREATE INDEX IF NOT EXISTS "PetReminder_userId_idx" ON "PetReminder"("userId");
CREATE INDEX IF NOT EXISTS "PetReminder_remindAt_idx" ON "PetReminder"("remindAt");
CREATE INDEX IF NOT EXISTS "FamilyItem_userId_idx" ON "FamilyItem"("userId");
CREATE INDEX IF NOT EXISTS "FamilyItem_domain_idx" ON "FamilyItem"("domain");
CREATE INDEX IF NOT EXISTS "FamilyItem_remindAt_idx" ON "FamilyItem"("remindAt");
CREATE INDEX IF NOT EXISTS "ParentMedication_userId_idx" ON "ParentMedication"("userId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Pet_userId_fkey') THEN
        ALTER TABLE "Pet" ADD CONSTRAINT "Pet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PetReminder_petId_fkey') THEN
        ALTER TABLE "PetReminder" ADD CONSTRAINT "PetReminder_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PetReminder_userId_fkey') THEN
        ALTER TABLE "PetReminder" ADD CONSTRAINT "PetReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FamilyItem_userId_fkey') THEN
        ALTER TABLE "FamilyItem" ADD CONSTRAINT "FamilyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ParentMedication_userId_fkey') THEN
        ALTER TABLE "ParentMedication" ADD CONSTRAINT "ParentMedication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
