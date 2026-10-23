import type { StaffRole } from "@/modules/identity/access";

export type StaffListItem = {
  id: string;
  displayName: string;
  email: string;
  roles: StaffRole[];
  roleLabels: string;
  mfaActive: boolean;
  disabled: boolean;
  lastLogin: string;
};
