package dev.flags.backend.audit;

import java.time.Instant;
import java.util.Optional;

/** A recorded change, as listed by the API. {@code envKey} is empty for flag-level changes (JSON: null). */
public record AuditEvent(
        long id, Instant at, String actor, String flagKey, Optional<String> envKey, AuditAction action, String summary) {}
