package dev.flags.backend.audit;

import java.util.List;
import java.util.Optional;

interface AuditRepository {

    void insert(AuditEntry entry);

    /** Newest first. An empty filter matches everything. */
    List<AuditEvent> find(Optional<String> flagKey, Optional<String> envKey, int limit);
}
