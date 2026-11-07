-- M4: staff roles for front-desk and branch management (ADR 018).
--
-- Kept in its own migration: Prisma runs each migration in one transaction,
-- and PostgreSQL does not allow a newly added enum value to be used in the
-- transaction that adds it. Nothing below uses the new values.

ALTER TYPE "AdminRole" ADD VALUE 'RECEPTIONIST';
ALTER TYPE "AdminRole" ADD VALUE 'MANAGER';
