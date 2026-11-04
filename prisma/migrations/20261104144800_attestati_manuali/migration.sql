-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Certificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Attestato di partecipazione',
    "courseTitle" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "periodFrom" DATETIME,
    "periodTo" DATETIME,
    "hours" REAL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT NOT NULL,
    "overrideReason" TEXT,
    "revokedAt" DATETIME,
    "revokeReason" TEXT,
    CONSTRAINT "Certificate_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Certificate" ("courseTitle", "enrollmentId", "hours", "id", "issuedAt", "issuedById", "number", "overrideReason", "periodFrom", "periodTo", "revokeReason", "revokedAt", "studentName", "title") SELECT "courseTitle", "enrollmentId", "hours", "id", "issuedAt", "issuedById", "number", "overrideReason", "periodFrom", "periodTo", "revokeReason", "revokedAt", "studentName", "title" FROM "Certificate";
DROP TABLE "Certificate";
ALTER TABLE "new_Certificate" RENAME TO "Certificate";
CREATE UNIQUE INDEX "Certificate_number_key" ON "Certificate"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
