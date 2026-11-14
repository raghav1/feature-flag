package dev.flags.backend.auth;

import java.util.Objects;

/** The logged-in user, as the rest of the backend sees them. */
public record AppUser(String username, Role role) {

    public AppUser {
        Objects.requireNonNull(username, "username");
        Objects.requireNonNull(role, "role");
    }
}
