package dev.flags.backend.apikeys;

import dev.flags.backend.auth.Role;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcApiKeyRepository implements ApiKeyRepository {

    private static final String COLUMNS =
            "id, name, role, prefix, created_by, created_at, expires_at, last_used_at, revoked_at, revoked_by";

    private final JdbcClient jdbc;

    JdbcApiKeyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ApiKey insert(String name, Role role, String prefix, String secretHash, String createdBy, Instant expiresAt) {
        return jdbc.sql("""
                        INSERT INTO api_key (name, role, prefix, secret_hash, created_by, expires_at)
                        VALUES (:name, :role, :prefix, :hash, :createdBy, :expiresAt)
                        RETURNING %s""".formatted(COLUMNS))
                .param("name", name)
                .param("role", role.name())
                .param("prefix", prefix)
                .param("hash", secretHash)
                .param("createdBy", createdBy)
                .param("expiresAt", Timestamp.from(expiresAt))
                .query(this::row)
                .single();
    }

    @Override
    public List<ApiKey> findAll() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM api_key ORDER BY id DESC").query(this::row).list();
    }

    @Override
    public Optional<ApiKey> findActiveByHash(String secretHash) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM api_key WHERE secret_hash = :hash AND revoked_at IS NULL AND expires_at > now()")
                .param("hash", secretHash)
                .query(this::row)
                .optional();
    }

    @Override
    public boolean existsActiveWithName(String name) {
        return jdbc.sql("SELECT count(*) FROM api_key WHERE name = :name AND revoked_at IS NULL")
                .param("name", name)
                .query(Integer.class)
                .single() > 0;
    }

    @Override
    public boolean revoke(long id, String revokedBy) {
        return jdbc.sql("UPDATE api_key SET revoked_at = now(), revoked_by = :by WHERE id = :id AND revoked_at IS NULL")
                .param("by", revokedBy)
                .param("id", id)
                .update() == 1;
    }

    @Override
    public void touch(long id) {
        jdbc.sql("""
                        UPDATE api_key SET last_used_at = now()
                        WHERE id = :id AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
                        """)
                .param("id", id)
                .update();
    }

    private ApiKey row(ResultSet rs, int rowNum) throws SQLException {
        return new ApiKey(
                rs.getLong("id"),
                rs.getString("name"),
                Role.valueOf(rs.getString("role")),
                rs.getString("prefix"),
                rs.getString("created_by"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(),
                Optional.ofNullable(rs.getTimestamp("last_used_at")).map(Timestamp::toInstant),
                Optional.ofNullable(rs.getTimestamp("revoked_at")).map(Timestamp::toInstant),
                Optional.ofNullable(rs.getString("revoked_by")));
    }
}
