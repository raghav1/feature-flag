package dev.flags.backend.environments;

import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcEnvironmentRepository implements EnvironmentRepository {

    private final JdbcClient jdbc;

    JdbcEnvironmentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Environment> findAll() {
        return jdbc.sql("SELECT key, name FROM environment ORDER BY sort_order")
                .query((rs, row) -> new Environment(rs.getString("key"), rs.getString("name")))
                .list();
    }

    @Override
    public boolean exists(String key) {
        return jdbc.sql("SELECT count(*) FROM environment WHERE key = :key").param("key", key).query(Integer.class).single() > 0;
    }
}
