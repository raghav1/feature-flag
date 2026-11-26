package dev.flags.backend.migration;

import static org.assertj.core.api.Assertions.assertThat;

import dev.flags.backend.ApiTest;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V5 also runs on databases that already exist. Migrates a scratch schema to V4, creates a user's own
 * {@code free-shipping} flag, then applies V5: the migration must succeed and leave that flag as it was.
 */
class FreeShippingSeedMigrationTest extends ApiTest {

    private static final String SCHEMA = "v5_upgrade";

    @Autowired
    private DataSource dataSource;

    private Flyway flyway(String target) {
        return Flyway.configure().dataSource(dataSource).schemas(SCHEMA).defaultSchema(SCHEMA)
                .cleanDisabled(false).target(target).load();
    }

    @Test
    void v5KeepsAFreeShippingFlagSomeoneAlreadyCreated() {
        flyway("latest").clean();
        flyway("4").migrate();
        JdbcTemplate db = new JdbcTemplate(dataSource);
        db.update("INSERT INTO " + SCHEMA + ".flag (key, description) VALUES ('free-shipping', 'Our own flag')");
        db.update("""
                INSERT INTO %1$s.flag_environment (flag_id, env_key, enabled, otherwise, rules)
                SELECT id, 'prod', false, true, '[]'::jsonb FROM %1$s.flag WHERE key = 'free-shipping'
                """.formatted(SCHEMA));

        flyway("latest").migrate();

        assertThat(db.queryForObject("SELECT description FROM " + SCHEMA + ".flag WHERE key = 'free-shipping'", String.class))
                .isEqualTo("Our own flag");
        List<Map<String, Object>> envs = db.queryForList("""
                SELECT fe.env_key, fe.enabled, fe.otherwise, fe.rules::text AS rules
                FROM %1$s.flag_environment fe JOIN %1$s.flag f ON f.id = fe.flag_id
                WHERE f.key = 'free-shipping'
                """.formatted(SCHEMA));
        assertThat(envs).containsExactly(Map.of("env_key", "prod", "enabled", false, "otherwise", true, "rules", "[]"));
        flyway("latest").clean();
    }
}
