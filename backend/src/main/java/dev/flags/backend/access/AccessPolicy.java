package dev.flags.backend.access;

import dev.flags.backend.auth.AppUser;
import dev.flags.backend.error.ForbiddenException;
import java.util.List;
import java.util.Objects;

/** The single place that decides who may change what. Called by services, never only by the UI. */
public interface AccessPolicy {

    boolean allows(AppUser user, FlagAction action);

    /** May this user toggle the flag or edit its rules in {@code envKey}? */
    boolean allowsEnvironmentChange(AppUser user, String envKey);

    /** May this user create, list and revoke agent API keys? */
    boolean allowsKeyManagement(AppUser user);

    default void requireKeyManagement(AppUser user) {
        if (!allowsKeyManagement(user)) {
            throw denied(user, "manage API keys");
        }
    }

    /** Everything this user may change, derived from the two checks above so it can't disagree with them. */
    default Permissions permissionsFor(AppUser user, List<String> envKeys) {
        return new Permissions(
                allows(user, FlagAction.CREATE_FLAG),
                allows(user, FlagAction.EDIT_DESCRIPTION),
                allows(user, FlagAction.DELETE_FLAG),
                envKeys.stream().filter(env -> allowsEnvironmentChange(user, env)).toList(),
                allowsKeyManagement(user));
    }

    default void require(AppUser user, FlagAction action) {
        if (!allows(user, action)) {
            throw denied(user, action.description());
        }
    }

    default void requireEnvironmentChange(AppUser user, String envKey) {
        Objects.requireNonNull(envKey, "envKey");
        if (!allowsEnvironmentChange(user, envKey)) {
            throw denied(user, "change " + envKey);
        }
    }

    private static ForbiddenException denied(AppUser user, String what) {
        return new ForbiddenException("%s (%s) may not %s.".formatted(user.username(), user.role().name().toLowerCase(), what));
    }
}
