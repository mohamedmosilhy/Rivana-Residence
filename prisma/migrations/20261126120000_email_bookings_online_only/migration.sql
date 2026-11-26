-- A booking verified by email is always paid online (Q-100, ADR 031): an email
-- code proves no phone, so the hotel does not hold a room on it without payment.
-- paymentMethod is written only at insert, so the rule cannot be broken later.
-- NOT VALID checks every new or updated row and skips rows that already exist:
-- M9 is not deployed, and a local database may hold the old demo booking.
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_email_online_check"
  CHECK ("verificationChannel" IS DISTINCT FROM 'EMAIL' OR "paymentMethod" = 'ONLINE') NOT VALID;
