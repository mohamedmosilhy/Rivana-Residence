"use client";

import { AdminErrorState } from "@/presentation/admin/ui/error-state";

export default function AdminError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <AdminErrorState reference={error.digest} retry={reset} />;
}
