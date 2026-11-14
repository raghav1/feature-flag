package dev.flags.backend.audit;

import java.time.Instant;

/** A recorded change, as listed by the API. */
public record AuditEvent(
        long id, Instant at, String actor, String flagKey, String envKey, AuditAction action, String summary) {}
