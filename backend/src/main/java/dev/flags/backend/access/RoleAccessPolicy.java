package dev.flags.backend.access;

import dev.flags.backend.auth.AppUser;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * ADMIN: everything. EDITOR: create flags, edit descriptions, change dev only; never delete (that wipes prod
 * too). VIEWER: read-only.
 */
@Component
class RoleAccessPolicy implements AccessPolicy {

    private static final Set<String> EDITOR_ENVIRONMENTS = Set.of("dev");

    @Override
    public boolean allows(AppUser user, Action action, String envKey) {
        return switch (user.role()) {
            case ADMIN -> true;
            case EDITOR -> switch (action) {
                case CREATE_FLAG, EDIT_DESCRIPTION -> true;
                case CHANGE_ENVIRONMENT -> envKey != null && EDITOR_ENVIRONMENTS.contains(envKey);
                case DELETE_FLAG -> false;
            };
            case VIEWER -> false;
        };
    }
}
