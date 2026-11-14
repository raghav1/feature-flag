package dev.flags.backend.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.flags.backend.SqlLike;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcAuditRepository implements AuditRepository {

    private final JdbcClient jdbc;
    private final ObjectMapper json;

    JdbcAuditRepository(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public void insert(AuditEntry e) {
        jdbc.sql("""
                        INSERT INTO audit_event (actor, flag_key, env_key, action, summary, before, after)
                        VALUES (:actor, :flagKey, :envKey, :action, :summary, :before::jsonb, :after::jsonb)
                        """)
                .param("actor", e.actor())
                .param("flagKey", e.flagKey())
                .param("envKey", e.envKey().orElse(null))
                .param("action", e.action().name())
                .param("summary", e.summary())
                .param("before", e.before().map(this::toJson).orElse(null))
                .param("after", e.after().map(this::toJson).orElse(null))
                .update();
    }

    @Override
    public List<AuditEvent> find(AuditQuery q) {
        return jdbc.sql("""
                        SELECT id, at, actor, flag_key, env_key, action, summary FROM audit_event
                        WHERE (CAST(:flagKey AS text) IS NULL OR flag_key = :flagKey)
                          AND (CAST(:envKey AS text) IS NULL OR env_key = :envKey)
                          AND (CAST(:action AS text) IS NULL OR action = :action)
                          AND (CAST(:actorType AS text) IS NULL OR (CAST(:actorType AS text) = 'KEY') = (actor LIKE 'key:%'))
                          AND (CAST(:before AS bigint) IS NULL OR id < :before)
                          AND (CAST(:text AS text) IS NULL
                               OR summary ILIKE :text ESCAPE '\\' OR flag_key ILIKE :text ESCAPE '\\' OR actor ILIKE :text ESCAPE '\\')
                        ORDER BY id DESC LIMIT :limit
                        """)
                .param("flagKey", q.flagKey().orElse(null))
                .param("envKey", q.envKey().orElse(null))
                .param("action", q.action().map(Enum::name).orElse(null))
                .param("actorType", q.actorType().map(Enum::name).orElse(null))
                .param("before", q.before().orElse(null))
                .param("text", q.text().map(SqlLike::contains).orElse(null))
                .param("limit", q.limit())
                .query((rs, row) -> new AuditEvent(
                        rs.getLong("id"),
                        rs.getTimestamp("at").toInstant(),
                        rs.getString("actor"),
                        rs.getString("flag_key"),
                        Optional.ofNullable(rs.getString("env_key")),
                        AuditAction.valueOf(rs.getString("action")),
                        rs.getString("summary")))
                .list();
    }

    private String toJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Cannot serialise audit payload", ex);
        }
    }
}
