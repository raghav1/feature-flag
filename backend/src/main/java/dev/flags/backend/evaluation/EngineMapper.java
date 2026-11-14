package dev.flags.backend.evaluation;

import dev.flags.backend.flags.FlagEnvironment;
import dev.flags.backend.flags.rules.RuleSpec;
import dev.flags.engine.FlagConfig;

/** The one place stored flag state becomes engine input. Each rule maps itself via {@link RuleSpec#toEngineRule()}. */
final class EngineMapper {

    private EngineMapper() {}

    static FlagConfig toFlagConfig(String flagKey, FlagEnvironment environment) {
        return new FlagConfig(
                flagKey,
                environment.enabled(),
                environment.rules().stream().map(RuleSpec::toEngineRule).toList(),
                environment.otherwise());
    }
}
