package dev.flags.backend.contexts;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcContextRepository implements ContextRepository {

    private final JdbcClient jdbc;

    JdbcContextRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void recordSeen(Map<ContextKind, String> seen) {
        if (seen.isEmpty()) {
            return;
        }
        List<String> rows = new ArrayList<>();
        var statement = new StringBuilder("INSERT INTO seen_context (kind, value) VALUES ");
        int i = 0;
        for (var ignored : seen.entrySet()) {
            rows.add("(:kind%d, :value%d)".formatted(i, i));
            i++;
        }
        statement.append(String.join(", ", rows)).append(" ON CONFLICT (kind, value) DO UPDATE SET last_seen = now()");
        var spec = jdbc.sql(statement.toString());
        i = 0;
        for (var entry : seen.entrySet()) {
            spec = spec.param("kind" + i, entry.getKey().value()).param("value" + i, entry.getValue());
            i++;
        }
        spec.update();
    }

    @Override
    public List<SeenContext> search(ContextKind kind, String query, int limit) {
        return jdbc.sql("""
                        SELECT value, last_seen FROM seen_context
                        WHERE kind = :kind AND value ILIKE :pattern ESCAPE '\\'
                        ORDER BY last_seen DESC, value
                        LIMIT :limit
                        """)
                .param("kind", kind.value())
                .param("pattern", "%" + escapeLike(query) + "%")
                .param("limit", limit)
                .query((rs, row) -> new SeenContext(rs.getString("value"), rs.getTimestamp("last_seen").toInstant()))
                .list();
    }

    @Override
    public Set<String> findSeen(ContextKind kind, Collection<String> values) {
        if (values.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("SELECT value FROM seen_context WHERE kind = :kind AND value IN (:values)")
                .param("kind", kind.value())
                .param("values", values)
                .query(String.class)
                .list());
    }

    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
