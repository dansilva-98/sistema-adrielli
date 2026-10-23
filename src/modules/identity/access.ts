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

export function canSwitchStaffArea(roles: readonly StaffRole[]): boolean {
  const admin = roles.some((role) => ADMIN_ROLES.includes(role));
  const clinic = roles.some((role) => CONSULTORIO_ROLES.includes(role));
  return admin && clinic;
}

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super admin",
  CONTENT_ADMIN: "Conteúdo",
  CLINIC_ADMIN: "Consultório",
};

export function rolesForStaffPath(pathname: string): readonly StaffRole[] | null {
  if (pathname === "/admin/usuarios" || pathname.startsWith("/admin/usuarios/")) {
    return USER_ADMIN_ROLES;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return ADMIN_ROLES;
  if (pathname === "/consultorio" || pathname.startsWith("/consultorio/")) {
    return CONSULTORIO_ROLES;
  }
  return null;
}
