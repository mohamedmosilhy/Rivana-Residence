import type { StaffRole } from "@/domain/shared/types";

export type Actor = Readonly<{
  id: string;
  role: StaffRole;
}>;
