package dev.flags.backend.auth;

import java.util.Objects;

/**
 * Who is making the request, as the rest of the backend sees them: a person logged in to the dashboard, or an
 * agent API key acting as a fixed role ({@code viaApiKey}).
 */
public record AppUser(String username, Role role, boolean viaApiKey) {

    /** Authority that marks a request authenticated by an API key rather than a login. */
    public static final String API_KEY_AUTHORITY = "API_KEY";

    public AppUser {
        Objects.requireNonNull(username, "username");
        Objects.requireNonNull(role, "role");
    }

    public AppUser(String username, Role role) {
        this(username, role, false);
    }
}
