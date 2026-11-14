package dev.flags.backend.audit;

import java.util.Objects;
import java.util.Optional;

/**
 * One change to record. Built through the factories so every field is present or explicitly empty:
 * flag-level changes have no environment, a creation has no "before", a deletion has no "after".
 */
public record AuditEntry(
        String actor,
        String flagKey,
        Optional<String> envKey,
        AuditAction action,
        String summary,
        Optional<Object> before,
        Optional<Object> after) {

    public AuditEntry {
        Objects.requireNonNull(actor, "actor");
        Objects.requireNonNull(flagKey, "flagKey");
        Objects.requireNonNull(envKey, "envKey");
        Objects.requireNonNull(action, "action");
        Objects.requireNonNull(summary, "summary");
        Objects.requireNonNull(before, "before");
        Objects.requireNonNull(after, "after");
    }

    public static AuditEntry created(String actor, String flagKey, Object after) {
        return new AuditEntry(actor, flagKey, Optional.empty(), AuditAction.FLAG_CREATED, "created flag",
                Optional.empty(), Optional.of(after));
    }

    public static AuditEntry deleted(String actor, String flagKey, Object before) {
        return new AuditEntry(actor, flagKey, Optional.empty(), AuditAction.FLAG_DELETED, "deleted flag",
                Optional.of(before), Optional.empty());
    }

    public static AuditEntry flagChanged(String actor, String flagKey, String summary, Object before, Object after) {
        return new AuditEntry(actor, flagKey, Optional.empty(), AuditAction.FLAG_UPDATED, summary,
                Optional.of(before), Optional.of(after));
    }

    public static AuditEntry environmentChanged(String actor, String flagKey, String envKey, AuditAction action,
            String summary, Object before, Object after) {
        return new AuditEntry(actor, flagKey, Optional.of(envKey), action, summary, Optional.of(before), Optional.of(after));
    }
}
