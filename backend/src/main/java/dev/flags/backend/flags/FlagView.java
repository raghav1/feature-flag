package dev.flags.backend.flags;

import dev.flags.backend.flags.rules.RuleSpec;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A flag as every client sees it: the dashboard over REST and agents over MCP get the same shape. */
public record FlagView(String key, String description, Instant createdAt, Instant updatedAt,
        Map<String, EnvironmentView> environments) {

    public record EnvironmentView(boolean enabled, boolean otherwise, List<RuleSpec> rules, int version, Instant updatedAt) {
        public static EnvironmentView of(FlagEnvironment e) {
            return new EnvironmentView(e.enabled(), e.otherwise(), e.rules(), e.version(), e.updatedAt());
        }
    }

    public static FlagView of(Flag flag) {
        Map<String, EnvironmentView> envs = new LinkedHashMap<>();
        flag.environments().forEach(e -> envs.put(e.envKey(), EnvironmentView.of(e)));
        return new FlagView(flag.key(), flag.description(), flag.createdAt(), flag.updatedAt(), envs);
    }
}
