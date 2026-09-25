// One-time outcome messages carried across a redirect as `?notice=<code>`.
// Only known codes render, so the URL cannot inject text into the page.
const NOTICES = {
  created: "Created as a draft. Nothing is public until you publish it.",
  deleted: "Permanently deleted.",
  replaced:
    "Replaced. Every place that used the old image now shows this one. The old image is still in the library until you delete it.",
} as const;

export type NoticeCode = keyof typeof NOTICES;

export function noticeFrom(value: unknown): NoticeCode | null {
  return typeof value === "string" && value in NOTICES
    ? (value as NoticeCode)
    : null;
}

export function Notice({ code }: Readonly<{ code: NoticeCode | null }>) {
  if (!code) return null;
  return (
    <p className="admin-notice" role="status">
      {NOTICES[code]}
    </p>
  );
}
