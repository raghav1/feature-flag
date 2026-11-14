package dev.flags.backend.access;

import dev.flags.backend.auth.AppUser;
import dev.flags.backend.error.ForbiddenException;

/** The single place that decides who may change what. Called by services, never only by the UI. */
public interface AccessPolicy {

    /** @param envKey the environment being changed, for {@link Action#CHANGE_ENVIRONMENT}; otherwise null */
    boolean allows(AppUser user, Action action, String envKey);

    default void require(AppUser user, Action action, String envKey) {
        if (!allows(user, action, envKey)) {
            throw new ForbiddenException("%s (%s) may not %s.".formatted(
                    user.username(), user.role().name().toLowerCase(), action.describe(envKey)));
        }
    }
}
