package dev.flags.engine;

import static dev.flags.engine.Contexts.user;
import static org.assertj.core.api.Assertions.assertThat;

import dev.flags.engine.rules.UserIdIn;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Open/closed: rule types and context attributes the engine has never heard of plug in
 * without any change to {@link Evaluator} or {@link EvaluationContext}.
 */
class CustomRuleTest {

    /** A rule that exists only in this test, on an attribute the engine knows nothing about. */
    record CountryIn(Set<String> countries) implements Rule {
        @Override
        public boolean matches(String flagKey, EvaluationContext context) {
            String country = context.attribute("country");
            return country != null && countries.contains(country);
        }

        @Override
        public boolean serve() {
            return true;
        }
    }

    private final Evaluator evaluator = new Evaluator();
    private final FlagConfig flag = new FlagConfig("dark-mode", true, List.of(new CountryIn(Set.of("NZ", "AU"))), false);

    @Test
    void customRuleReadsAnAttributeTheEngineHasNeverHeardOf() {
        var result = evaluator.evaluate(flag, user("u_1", "country", "NZ"));

        assertThat(result).isEqualTo(new EvaluationResult(true, Reason.RULE_MATCH, 0));
    }

    @Test
    void customRuleMissesOnOtherValuesOrAbsentAttribute() {
        assertThat(evaluator.evaluate(flag, user("u_1", "country", "US")).reason()).isEqualTo(Reason.OTHERWISE);
        assertThat(evaluator.evaluate(flag, user("u_1")).reason()).isEqualTo(Reason.OTHERWISE);
    }

    @Test
    void customRulesMixWithBuiltInRulesInOrder() {
        var mixed = new FlagConfig("dark-mode", true,
                List.of(new UserIdIn(Set.of("u_102"), false), new CountryIn(Set.of("NZ"))), false);
        var context = new EvaluationContext("u_102", Map.of("country", "NZ", "customer", "acme"));

        assertThat(evaluator.evaluate(mixed, context)).isEqualTo(new EvaluationResult(false, Reason.RULE_MATCH, 0));
    }
}
