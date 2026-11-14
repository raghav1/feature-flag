package dev.flags.backend.flags;

import dev.flags.backend.flags.rules.RuleSpec;
import java.time.Instant;
import java.util.List;

/** A flag's state in one environment. {@code version} increments on every change (optimistic locking). */
public record FlagEnvironment(
        String envKey, boolean enabled, boolean otherwise, List<RuleSpec> rules, int version, Instant updatedAt) {

    public FlagEnvironment {
        rules = List.copyOf(rules);
    }

    EnvironmentSnapshot snapshot() {
        return new EnvironmentSnapshot(enabled, otherwise, rules);
    }
}
