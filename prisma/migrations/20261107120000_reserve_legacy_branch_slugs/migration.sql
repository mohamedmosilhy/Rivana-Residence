-- M5 (spec 0002, AC-16): `/about`, `/contact`, `/rooms`, and `/facilities`
-- now redirect permanently to the default branch (next.config.ts), so a
-- branch with one of those slugs could never be reached. Reserve them next
-- to the M4 list. Fails loudly if an existing branch would violate it.
ALTER TABLE "Branch" DROP CONSTRAINT "Branch_slug_check";
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_slug_check" CHECK (
    "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND "slug" NOT IN (
        'admin', 'api', 'media', 'reservations', 'book', 'sitemap.xml', 'robots.txt',
        'about', 'contact', 'rooms', 'facilities'
    )
    AND "slug" NOT LIKE '%.html'
);
