export const AUDIT_ACTIONS = [
  "user.bootstrap",
  "auth.login.success",
  "auth.login.failure",
  "auth.logout",
  "auth.session.expired",
  "auth.mfa.enrolled",
  "auth.mfa.failure",
  "auth.password.reset",
  "user.invited",
  "user.role.granted",
  "user.role.revoked",
  "user.disabled",
  "user.enabled",
  "access.denied",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
