package dev.flags.backend.evaluation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.flags.backend.flags.FlagEnvironment;
import dev.flags.backend.flags.rules.AttributeRule;
import dev.flags.backend.flags.rules.CustomersRule;
import dev.flags.backend.flags.rules.PercentRule;
import dev.flags.backend.flags.rules.RuleSpec;
import dev.flags.backend.flags.rules.UsersRule;
import dev.flags.engine.FlagConfig;
import dev.flags.engine.rules.AttributeIn;
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
                new PercentRule(10, null),
                new AttributeRule("country", "in", List.of("US", "CA"), null),
                new AttributeRule("plan", "not_in", List.of("free"), false)), 3, Instant.EPOCH);

        FlagConfig config = EngineMapper.toFlagConfig("new-dashboard", environment);

        assertThat(config.key()).isEqualTo("new-dashboard");
        assertThat(config.enabled()).isTrue();
        assertThat(config.otherwise()).isTrue();
        assertThat(config.rules()).containsExactly(
                new UserIdIn(Set.of("u_102", "u_207"), true),
                new CustomerIdIn(Set.of("acme"), false),
                new PercentRollout(10, true),
                new AttributeIn("country", AttributeIn.Operator.IN, Set.of("US", "CA"), true),
                new AttributeIn("plan", AttributeIn.Operator.NOT_IN, Set.of("free"), false));
    }

    @Test
    void ruleTypeNamesMatchTheJsonTypes() {
        assertThat(new UsersRule(List.of("u"), null).typeName()).isEqualTo("users");
        assertThat(new CustomersRule(List.of("c"), null).typeName()).isEqualTo("customers");
        assertThat(new PercentRule(1, null).typeName()).isEqualTo("percent");
        assertThat(new AttributeRule("country", "in", List.of("US"), null).typeName()).isEqualTo("attribute");
    }

    @Test
    void unknownStoredOperatorFailsLoudlyInsteadOfBecomingIn() {
        // Rules read from the DB (or seeded as raw SQL JSON) skip @Valid, so a typo must not invert targeting.
        var typo = new AttributeRule("country", "not-in", List.of("US"), null);

        assertThatThrownBy(typo::toEngineRule).isInstanceOf(IllegalStateException.class).hasMessageContaining("not-in");
        assertThatThrownBy(typo::describe).isInstanceOf(IllegalStateException.class).hasMessageContaining("not-in");
    }

    @Test
    void typeNamesListsEverySubtypeInRegistrationOrder() {
        assertThat(RuleSpec.typeNames()).containsExactly("users", "customers", "percent", "attribute");
    }
}
