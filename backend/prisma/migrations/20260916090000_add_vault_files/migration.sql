-- Zero-knowledge Secure Vault: files encrypted client-side with a
-- device-only key before upload. The server stores/serves ciphertext only.
CREATE TABLE "VaultFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VaultFile_userId_idx" ON "VaultFile"("userId");

ALTER TABLE "VaultFile" ADD CONSTRAINT "VaultFile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
