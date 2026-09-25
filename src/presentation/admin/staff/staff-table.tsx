import { ROLE_LABELS } from "@/presentation/admin/format";
import { Badge } from "@/presentation/admin/ui/badge";
import { DataTable } from "@/presentation/admin/ui/data-table";

type StaffRow = Readonly<{
  id: string;
  name: string;
  email: string;
  role: "EDITOR" | "ADMIN";
  active: boolean;
  activeSessions: number;
}>;

export function StaffTable({
  staff,
}: Readonly<{ staff: readonly StaffRow[] }>) {
  return (
    <DataTable
      caption="Staff accounts"
      rows={staff}
      rowKey={(member) => member.id}
      columns={[
        { header: "Name", rowHeader: true, cell: (member) => member.name },
        { header: "Email", cell: (member) => member.email },
        { header: "Role", cell: (member) => ROLE_LABELS[member.role] },
        {
          header: "Status",
          cell: (member) =>
            member.active ? (
              <Badge tone="success">Active</Badge>
            ) : (
              <Badge>Deactivated</Badge>
            ),
        },
        {
          header: "Active sessions",
          cell: (member) => member.activeSessions,
        },
      ]}
    />
  );
}
