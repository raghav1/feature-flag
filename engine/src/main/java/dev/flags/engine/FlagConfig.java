package dev.flags.engine;

import java.util.List;
import java.util.Objects;

/**
 * A flag's configuration in one environment.
 *
 * @param key       flag key; part of the rollout hash, so it must never change
 * @param enabled   when false the flag is OFF and rules are not consulted
 * @param rules     ordered; the first match wins
 * @param otherwise value served when enabled and no rule matches
 */
public record FlagConfig(String key, boolean enabled, List<Rule> rules, boolean otherwise) {

    public FlagConfig {
        Objects.requireNonNull(key, "key must not be null");
        if (key.isBlank()) {
            throw new IllegalArgumentException("key must not be blank");
        }
        Objects.requireNonNull(rules, "rules must not be null");
        // Not rules.contains(null): immutable lists throw NPE on that call.
        if (rules.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException("rules must not contain null");
        }
        rules = List.copyOf(rules);
    }
}
