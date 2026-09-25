type StaffRow = Readonly<{
  id: string;
  name: string;
  email: string;
  role: "EDITOR" | "ADMIN";
  active: boolean;
  activeSessions: number;
}>;

const roleLabels = { ADMIN: "Administrator", EDITOR: "Editor" } as const;

export function StaffTable({
  staff,
}: Readonly<{ staff: readonly StaffRow[] }>) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption className="sr-only">Staff accounts</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Active sessions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id}>
              <th scope="row">{member.name}</th>
              <td>{member.email}</td>
              <td>{roleLabels[member.role]}</td>
              <td>{member.active ? "Active" : "Deactivated"}</td>
              <td>{member.activeSessions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
