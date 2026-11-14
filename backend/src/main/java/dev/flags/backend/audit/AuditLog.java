package dev.flags.backend.audit;

import java.util.List;
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

    public List<AuditEvent> recent(String flagKey, String envKey, int limit) {
        return repository.find(flagKey, envKey, limit);
    }
}
