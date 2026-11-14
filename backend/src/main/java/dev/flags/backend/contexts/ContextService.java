package dev.flags.backend.contexts;

import dev.flags.engine.EvaluationContext;
import dev.flags.engine.rules.CustomerIdIn;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

/**
 * Remembers which user and customer IDs the service has evaluated, so the admin UI can suggest them and warn
 * about IDs it has never seen. Unknown IDs are still allowed in rules: you may target someone before their
 * first visit.
 */
@Service
public class ContextService {

    private static final Logger log = LoggerFactory.getLogger(ContextService.class);

    private final ContextRepository contexts;

    ContextService(ContextRepository contexts) {
        this.contexts = contexts;
    }

    /**
     * Best effort: evaluation must not fail because bookkeeping did. Only well-formed IDs are recorded. Runs in
     * its own autocommit statement, so call it outside read-only transactions.
     */
    public void recordSeen(EvaluationContext context) {
        Map<ContextKind, String> seen = new EnumMap<>(ContextKind.class);
        context.userId().filter(ContextIds::isValid).ifPresent(id -> seen.put(ContextKind.USER, id));
        context.attribute(CustomerIdIn.ATTRIBUTE).filter(ContextIds::isValid).ifPresent(id -> seen.put(ContextKind.CUSTOMER, id));
        try {
            contexts.recordSeen(seen);
        } catch (DataAccessException e) {
            log.warn("Couldn't record seen contexts {}: {}", seen, e.getMessage());
        }
    }

    public List<SeenContext> suggest(ContextKind kind, String query, int limit) {
        return contexts.search(kind, query.strip(), limit);
    }

    /** The values (in the given order, without duplicates) the service has never seen. */
    public List<String> unseen(ContextKind kind, List<String> values) {
        var distinct = new LinkedHashSet<>(values);
        var seen = contexts.findSeen(kind, distinct);
        return distinct.stream().filter(v -> !seen.contains(v)).toList();
    }
}
