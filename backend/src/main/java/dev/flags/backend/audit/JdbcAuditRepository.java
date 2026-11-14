package dev.flags.backend.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
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
                .param("envKey", e.envKey())
                .param("action", e.action().name())
                .param("summary", e.summary())
                .param("before", toJson(e.before()))
                .param("after", toJson(e.after()))
                .update();
    }

    @Override
    public List<AuditEvent> find(String flagKey, String envKey, int limit) {
        return jdbc.sql("""
                        SELECT id, at, actor, flag_key, env_key, action, summary FROM audit_event
                        WHERE (CAST(:flagKey AS text) IS NULL OR flag_key = :flagKey)
                          AND (CAST(:envKey AS text) IS NULL OR env_key = :envKey)
                        ORDER BY id DESC LIMIT :limit
                        """)
                .param("flagKey", flagKey)
                .param("envKey", envKey)
                .param("limit", limit)
                .query((rs, row) -> new AuditEvent(
                        rs.getLong("id"),
                        rs.getTimestamp("at").toInstant(),
                        rs.getString("actor"),
                        rs.getString("flag_key"),
                        rs.getString("env_key"),
                        AuditAction.valueOf(rs.getString("action")),
                        rs.getString("summary")))
                .list();
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Cannot serialise audit payload", ex);
        }
    }
}
