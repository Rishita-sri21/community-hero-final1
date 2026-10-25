import AuditLog from '../models/AuditLog';
import { log } from './logger';

export type AuditEvent = 'AUTH_LOGIN' | 'AUTH_REGISTER' | 'REPORT_CREATED' | 'REPORT_VERIFIED' | 'REPORT_RESOLVED' | 'POINTS_TRANSACTION' | 'SECURITY_VIOLATION' | 'DB_EXPORT' | 'JOB_RETRIED' | 'REPORT_MERGED';

// Records a security-relevant event in MongoDB. Never awaited by callers and never throws:
// a failed log write must not fail the request that triggered it.
export function logAuditEvent(event: AuditEvent, message: string, success: boolean, userEmail?: string, ipAddress?: string) {
  AuditLog.create({ event, message, success, userEmail, ipAddress }).catch((e) => {
    log.error('Failed to write audit event:', e);
  });
}
