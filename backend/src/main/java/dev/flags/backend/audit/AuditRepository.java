package dev.flags.backend.audit;

import java.util.List;

interface AuditRepository {

    void insert(AuditEntry entry);

    /** Newest first. Null filters match everything. */
    List<AuditEvent> find(String flagKey, String envKey, int limit);
}
