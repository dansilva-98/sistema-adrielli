export const STAFF_ROLES = ["SUPER_ADMIN", "CONTENT_ADMIN", "CLINIC_ADMIN"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(value: string): value is StaffRole {
  return STAFF_ROLES.some((role) => role === value);
}

export function roleRequiresMfa(role: StaffRole): boolean {
  return role === "SUPER_ADMIN" || role === "CLINIC_ADMIN";
}

export function staffRequiresMfa(roles: readonly StaffRole[]): boolean {
  return roles.some(roleRequiresMfa);
}

export const ADMIN_ROLES: readonly StaffRole[] = ["SUPER_ADMIN", "CONTENT_ADMIN"];
export const CONSULTORIO_ROLES: readonly StaffRole[] = ["SUPER_ADMIN", "CLINIC_ADMIN"];
export const USER_ADMIN_ROLES: readonly StaffRole[] = ["SUPER_ADMIN"];

export function staffHome(roles: readonly StaffRole[]): "/admin" | "/consultorio" {
  if (roles.includes("SUPER_ADMIN") || roles.includes("CONTENT_ADMIN")) return "/admin";
  return "/consultorio";
}
