package dev.flags.backend.audit;

import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Records changes and lists them. Callers record inside their own transaction, so a failed change leaves no entry. */
@Service
public class AuditLog {

    private final AuditRepository repository;

    AuditLog(AuditRepository repository) {
        this.repository = repository;
    }

    public void record(AuditEntry entry) {
        repository.insert(entry);
    }

    public List<AuditEvent> recent(Optional<String> flagKey, Optional<String> envKey, int limit) {
        return search(AuditQuery.forFlag(flagKey, envKey, limit));
    }

    public List<AuditEvent> search(AuditQuery query) {
        return repository.find(query);
    }
}
