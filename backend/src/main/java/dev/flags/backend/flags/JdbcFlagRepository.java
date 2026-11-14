package dev.flags.backend.flags;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.flags.backend.flags.rules.RuleSpec;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcFlagRepository implements FlagRepository {

    private static final TypeReference<List<RuleSpec>> RULES = new TypeReference<>() {};

    private static final String SELECT_FLAGS = "SELECT id, key, description, created_at, updated_at FROM flag";
    private static final String SELECT_ENVIRONMENTS = """
            SELECT fe.flag_id, fe.env_key, fe.enabled, fe.otherwise, fe.rules::text AS rules, fe.version, fe.updated_at
            FROM flag_environment fe JOIN environment e ON e.key = fe.env_key
            """;

    private record FlagRow(long id, String key, String description, Instant createdAt, Instant updatedAt) {}

    private final JdbcClient jdbc;
    private final ObjectMapper json;

    JdbcFlagRepository(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public List<Flag> findAll() {
        List<FlagRow> rows = jdbc.sql(SELECT_FLAGS + " ORDER BY key").query(this::flagRow).list();
        Map<Long, List<FlagEnvironment>> envs = new LinkedHashMap<>();
        jdbc.sql(SELECT_ENVIRONMENTS + " ORDER BY e.sort_order")
                .query((RowCallbackHandler) rs ->
                        envs.computeIfAbsent(rs.getLong("flag_id"), id -> new ArrayList<>()).add(environmentRow(rs)));
        return rows.stream().map(r -> toFlag(r, envs.getOrDefault(r.id(), List.of()))).toList();
    }

    @Override
    public Optional<Flag> findByKey(String key) {
        return jdbc.sql(SELECT_FLAGS + " WHERE key = :key").param("key", key).query(this::flagRow).optional()
                .map(row -> toFlag(row, jdbc.sql(SELECT_ENVIRONMENTS + " WHERE fe.flag_id = :id ORDER BY e.sort_order")
                        .param("id", row.id())
                        .query((rs, n) -> environmentRow(rs))
                        .list()));
    }

    @Override
    public boolean existsByKey(String key) {
        return jdbc.sql("SELECT count(*) FROM flag WHERE key = :key").param("key", key).query(Integer.class).single() > 0;
    }

    @Override
    public Flag insert(String key, String description) {
        long id = jdbc.sql("INSERT INTO flag (key, description) VALUES (:key, :description) RETURNING id")
                .param("key", key)
                .param("description", description)
                .query(Long.class)
                .single();
        jdbc.sql("INSERT INTO flag_environment (flag_id, env_key) SELECT :id, key FROM environment")
                .param("id", id)
                .update();
        return findByKey(key).orElseThrow();
    }

    @Override
    public void updateDescription(long flagId, String description) {
        jdbc.sql("UPDATE flag SET description = :description, updated_at = now() WHERE id = :id")
                .param("description", description)
                .param("id", flagId)
                .update();
    }

    @Override
    public void delete(long flagId) {
        jdbc.sql("DELETE FROM flag WHERE id = :id").param("id", flagId).update();
    }

    @Override
    public boolean updateEnvironment(long flagId, String envKey, EnvironmentSnapshot state, int expectedVersion) {
        int updated = jdbc.sql("""
                        UPDATE flag_environment
                        SET enabled = :enabled, otherwise = :otherwise, rules = :rules::jsonb,
                            version = version + 1, updated_at = now()
                        WHERE flag_id = :id AND env_key = :env AND version = :version
                        """)
                .param("enabled", state.enabled())
                .param("otherwise", state.otherwise())
                .param("rules", writeRules(state.rules()))
                .param("id", flagId)
                .param("env", envKey)
                .param("version", expectedVersion)
                .update();
        if (updated == 1) {
            jdbc.sql("UPDATE flag SET updated_at = now() WHERE id = :id").param("id", flagId).update();
        }
        return updated == 1;
    }

    private FlagRow flagRow(ResultSet rs, int rowNum) throws SQLException {
        return new FlagRow(
                rs.getLong("id"),
                rs.getString("key"),
                rs.getString("description"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    private FlagEnvironment environmentRow(ResultSet rs) throws SQLException {
        return new FlagEnvironment(
                rs.getString("env_key"),
                rs.getBoolean("enabled"),
                rs.getBoolean("otherwise"),
                readRules(rs.getString("rules")),
                rs.getInt("version"),
                rs.getTimestamp("updated_at").toInstant());
    }

    private static Flag toFlag(FlagRow row, List<FlagEnvironment> environments) {
        return new Flag(row.id(), row.key(), row.description(), row.createdAt(), row.updatedAt(), environments);
    }

    private List<RuleSpec> readRules(String rules) {
        try {
            return json.readValue(rules, RULES);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unreadable rules in database: " + rules, e);
        }
    }

    private String writeRules(List<RuleSpec> rules) {
        try {
            return json.writerFor(RULES).writeValueAsString(rules);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise rules", e);
        }
    }
}
