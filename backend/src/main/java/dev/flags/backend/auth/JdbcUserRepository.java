package dev.flags.backend.auth;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcUserRepository implements UserRepository {

    private final JdbcClient jdbc;

    JdbcUserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<StoredUser> findByUsername(String username) {
        return jdbc.sql("SELECT username, password_hash, role FROM app_user WHERE username = :username")
                .param("username", username)
                .query((rs, row) -> new StoredUser(
                        rs.getString("username"), rs.getString("password_hash"), Role.valueOf(rs.getString("role"))))
                .optional();
    }
}
