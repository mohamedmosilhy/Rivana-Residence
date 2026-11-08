export type SeedOptions = Readonly<{ demo: boolean }>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** True when APP_URL is set and does not point at this machine. */
function pointsAwayFromThisMachine(appUrl: string | undefined) {
  if (!appUrl) return false;
  try {
    return !LOCAL_HOSTS.has(new URL(appUrl).hostname);
  } catch {
    // An APP_URL that cannot be read is treated as not local, to be safe.
    return true;
  }
}

/**
 * Reads the seed's command line flags. The only flag is `--demo`, which adds
 * fictional demo data. It is refused in production so a mistake on the server
 * can never put a fake branch on the live site. Two signals count as
 * production, because an SSH shell on the server often has no NODE_ENV:
 *
 *   - NODE_ENV is "production", or
 *   - APP_URL is set to a host other than localhost (the server's .env must
 *     set APP_URL to the real https address for the site to work at all).
 *
 * An unknown flag is an error, so a typo cannot silently change what runs.
 * Pure: the entry file passes `process.argv.slice(2)` and `process.env`.
 */
export function resolveSeedOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): SeedOptions {
  const unknown = args.filter((arg) => arg !== "--demo");
  if (unknown.length > 0) {
    throw new Error(
      `Unknown seed option: ${unknown.join(" ")}. The only option is --demo.`,
    );
  }
  const demo = args.includes("--demo");
  if (demo && env.NODE_ENV === "production") {
    throw new Error(
      "Refusing --demo in production: the demo data is fictional and for local review only.",
    );
  }
  if (demo && pointsAwayFromThisMachine(env.APP_URL)) {
    throw new Error(
      "Refusing --demo: APP_URL does not point at this machine, so this looks like a real site. The demo data is fictional and for local review only.",
    );
  }
  return { demo };
}
