package dev.flags.backend.audit;

import java.util.List;

interface AuditRepository {

    void insert(AuditEntry entry);

    /** Newest first. Empty filters match everything. */
    List<AuditEvent> find(AuditQuery query);
}
