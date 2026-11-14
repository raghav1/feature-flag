package dev.flags.backend.contexts;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

interface ContextRepository {

    /** Inserts or refreshes last_seen for each (kind, value). One statement. */
    void recordSeen(Map<ContextKind, String> seen);

    /** Most recently seen first; {@code query} matches anywhere in the value, case-insensitively. */
    List<SeenContext> search(ContextKind kind, String query, int limit);

    /** The subset of {@code values} that has been seen. */
    Set<String> findSeen(ContextKind kind, Collection<String> values);
}
