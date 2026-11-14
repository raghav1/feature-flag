package dev.flags.backend.access;

import java.util.List;

/**
 * What a user may change, for the UI to enable or hide controls. Derived from {@link AccessPolicy}; the server
 * still enforces every request.
 */
public record Permissions(boolean createFlag, boolean editDescription, boolean deleteFlag, List<String> changeEnvironments) {

    public Permissions {
        changeEnvironments = List.copyOf(changeEnvironments);
    }
}
