package dev.flags.backend.apikeys;

import dev.flags.backend.auth.Role;
import java.time.Instant;
import java.util.Optional;

/** An agent key as listed to admins. Never carries the token or its hash. */
public record ApiKey(
        long id,
        String name,
        Role role,
        String prefix,
        String createdBy,
        Instant createdAt,
        Instant expiresAt,
        Optional<Instant> lastUsedAt,
        Optional<Instant> revokedAt,
        Optional<String> revokedBy) {

    public boolean activeAt(Instant now) {
        return revokedAt.isEmpty() && expiresAt.isAfter(now);
    }

    /** How the key appears as the actor in the audit log, e.g. "key:release-bot". */
    public String actor() {
        return "key:" + name;
    }
}
