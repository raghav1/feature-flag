package dev.flags.engine.rules;

import java.util.Objects;
import java.util.Set;

final class IdSets {

    private IdSets() {}

    /** Validates and copies a non-empty set of non-blank ids. */
    static Set<String> copyOf(Set<String> ids, String name) {
        Objects.requireNonNull(ids, name + " must not be null");
        if (ids.isEmpty()) {
            throw new IllegalArgumentException(name + " must not be empty");
        }
        if (ids.stream().anyMatch(id -> id == null || id.isBlank())) {
            throw new IllegalArgumentException(name + " must not contain blank ids");
        }
        return Set.copyOf(ids);
    }
}
