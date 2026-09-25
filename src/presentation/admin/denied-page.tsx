import { AccessDenied } from "@/presentation/admin/auth/access-denied";
import { PageHeader } from "@/presentation/admin/ui/page-header";

export function DeniedPage({ title }: Readonly<{ title: string }>) {
  return (
    <>
      <PageHeader title={title} />
      <AccessDenied />
    </>
  );
}
