package dev.flags.backend.evaluation;

import static org.assertj.core.api.Assertions.assertThat;

import dev.flags.backend.flags.FlagEnvironment;
import dev.flags.backend.flags.rules.CustomersRule;
import dev.flags.backend.flags.rules.PercentRule;
import dev.flags.backend.flags.rules.UsersRule;
import dev.flags.engine.FlagConfig;
import dev.flags.engine.rules.CustomerIdIn;
import dev.flags.engine.rules.PercentRollout;
import dev.flags.engine.rules.UserIdIn;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class EngineMapperTest {

    @Test
    void mapsStateAndEveryRuleTypeInOrder() {
        var environment = new FlagEnvironment("prod", true, true, List.of(
                new UsersRule(List.of("u_102", "u_207", "u_102"), null),
                new CustomersRule(List.of("acme"), false),
                new PercentRule(10, null)), 3, Instant.EPOCH);

        FlagConfig config = EngineMapper.toFlagConfig("new-dashboard", environment);

        assertThat(config.key()).isEqualTo("new-dashboard");
        assertThat(config.enabled()).isTrue();
        assertThat(config.otherwise()).isTrue();
        assertThat(config.rules()).containsExactly(
                new UserIdIn(Set.of("u_102", "u_207"), true),
                new CustomerIdIn(Set.of("acme"), false),
                new PercentRollout(10, true));
    }

    @Test
    void ruleTypeNamesMatchTheJsonTypes() {
        assertThat(new UsersRule(List.of("u"), null).typeName()).isEqualTo("users");
        assertThat(new CustomersRule(List.of("c"), null).typeName()).isEqualTo("customers");
        assertThat(new PercentRule(1, null).typeName()).isEqualTo("percent");
    }
}
