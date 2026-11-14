package dev.flags.backend.flags;

import dev.flags.backend.flags.rules.RuleSpec;
import java.util.List;

/** The editable part of a flag's environment state; also what the audit log stores as before/after. */
public record EnvironmentSnapshot(boolean enabled, boolean otherwise, List<RuleSpec> rules) {

    public EnvironmentSnapshot {
        rules = List.copyOf(rules);
    }
}
