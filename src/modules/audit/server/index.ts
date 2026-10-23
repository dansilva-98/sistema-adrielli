import "server-only";

export const auditServerModule = "audit";

export { recordAudit, type AuditEvent } from "../record";
