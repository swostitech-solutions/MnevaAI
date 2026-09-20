-- Forgot Password: dedicated columns, separate from verifyToken/verifyTokenExp
-- (email verification) so an in-progress signup verification and a password
-- reset can never collide or accidentally complete one another.
ALTER TABLE "User" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "resetTokenExp" TIMESTAMP(3);
