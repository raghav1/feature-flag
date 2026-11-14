package dev.flags.backend.access;

import dev.flags.backend.auth.AppUser;
import dev.flags.backend.auth.Role;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * ADMIN: everything, including agent API keys. EDITOR: create flags, edit descriptions, change dev only; never
 * delete (that wipes prod too). VIEWER: read-only. An API key acts as exactly one of these roles.
 */
@Component
class RoleAccessPolicy implements AccessPolicy {

    private static final Set<String> EDITOR_ENVIRONMENTS = Set.of("dev");

    @Override
    public boolean allows(AppUser user, FlagAction action) {
        return switch (user.role()) {
            case ADMIN -> true;
            // Exhaustive on purpose: a new action must be decided here, not allowed by default.
            case EDITOR -> switch (action) {
                case CREATE_FLAG, EDIT_DESCRIPTION -> true;
                case DELETE_FLAG -> false;
            };
            case VIEWER -> false;
        };
    }

    @Override
    public boolean allowsEnvironmentChange(AppUser user, String envKey) {
        Objects.requireNonNull(envKey, "envKey");
        return switch (user.role()) {
            case ADMIN -> true;
            case EDITOR -> EDITOR_ENVIRONMENTS.contains(envKey);
            case VIEWER -> false;
        };
    }

    @Override
    public boolean allowsKeyManagement(AppUser user) {
        // Keys never mint or revoke keys, even an ADMIN key: a leaked key must not be able to entrench itself.
        return user.role() == Role.ADMIN && !user.viaApiKey();
    }
}
