-- The other end of each stay window (Q-102): the latest check-in and the
-- earliest check-out. Both are optional and shown to guests only.
ALTER TABLE "Branch"
    ADD COLUMN "checkInUntilTime" VARCHAR(5),
    ADD COLUMN "checkOutFromTime" VARCHAR(5);

-- HH:MM text compares in time order. A window never passes midnight.
ALTER TABLE "Branch"
    ADD CONSTRAINT "Branch_stay_window_format_check" CHECK (
        ("checkInUntilTime" IS NULL OR "checkInUntilTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
        AND ("checkOutFromTime" IS NULL OR "checkOutFromTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    ),
    ADD CONSTRAINT "Branch_check_in_window_check" CHECK (
        "checkInUntilTime" IS NULL
        OR ("checkInTime" IS NOT NULL AND "checkInUntilTime" > "checkInTime")
    ),
    ADD CONSTRAINT "Branch_check_out_window_check" CHECK (
        "checkOutFromTime" IS NULL
        OR ("checkOutTime" IS NOT NULL AND "checkOutFromTime" < "checkOutTime")
    );
