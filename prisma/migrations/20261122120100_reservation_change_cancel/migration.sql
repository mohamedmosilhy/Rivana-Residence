-- M8-T9 follow-up: a cancellation of a booking already entered in the hotel
-- system is a change too (Q-84), and the actor kind gets the same check as `kind`.
ALTER TABLE "ReservationChange"
  DROP CONSTRAINT "ReservationChange_kind_check",
  ADD CONSTRAINT "ReservationChange_kind_check" CHECK ("kind" IN ('STAY', 'CANCEL')),
  ADD CONSTRAINT "ReservationChange_actorType_check" CHECK ("actorType" IN ('STAFF', 'GUEST', 'SYSTEM'));
