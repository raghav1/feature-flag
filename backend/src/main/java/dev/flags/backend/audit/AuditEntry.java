package dev.flags.backend.audit;

/**
 * One change to record. {@code before}/{@code after} are stored as JSON.
 *
 * @param envKey null for flag-level changes (create, describe, delete)
 */
public record AuditEntry(
        String actor, String flagKey, String envKey, AuditAction action, String summary, Object before, Object after) {}
