package dev.flags.engine;

import static dev.flags.engine.Contexts.anonymous;
import static dev.flags.engine.Contexts.user;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import dev.flags.engine.rules.CustomerIdIn;
import dev.flags.engine.rules.PercentRollout;
import dev.flags.engine.rules.UserIdIn;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class EvaluatorTest {

    private final Evaluator evaluator = new Evaluator();

    private static FlagConfig flag(boolean enabled, boolean otherwise, Rule... rules) {
        return new FlagConfig("new-dashboard", enabled, List.of(rules), otherwise);
    }

    @Test
    void disabledFlagIsOffEvenWhenARuleWouldMatch() {
        var result = evaluator.evaluate(flag(false, false, new UserIdIn(Set.of("u_102"))), user("u_102"));

        assertThat(result).isEqualTo(new EvaluationResult(false, Reason.FLAG_OFF, null));
    }

    @Test
    void disabledFlagIgnoresOtherwiseOn() {
        var result = evaluator.evaluate(flag(false, true), user("u_102"));

        assertThat(result.value()).isFalse();
        assertThat(result.reason()).isEqualTo(Reason.FLAG_OFF);
    }

    @Test
    void matchingRuleServesItsValueAndReportsItsIndex() {
        var result = evaluator.evaluate(flag(true, false, new UserIdIn(Set.of("u_102"))), user("u_102"));

        assertThat(result).isEqualTo(new EvaluationResult(true, Reason.RULE_MATCH, 0));
    }

    @Test
    void firstMatchWinsWhenSeveralRulesMatch() {
        var flag = flag(true, true,
                new UserIdIn(Set.of("u_207"), false),
                new CustomerIdIn(Set.of("acme")),
                new PercentRollout(100));

        var result = evaluator.evaluate(flag, user("u_207", "customer", "acme"));

        assertThat(result).isEqualTo(new EvaluationResult(false, Reason.RULE_MATCH, 0));
    }

    @Test
    void laterRuleMatchesWhenEarlierOnesDoNot() {
        var flag = flag(true, false,
                new UserIdIn(Set.of("u_102")),
                new CustomerIdIn(Set.of("acme")));

        var result = evaluator.evaluate(flag, user("u_207", "customer", "acme"));

        assertThat(result).isEqualTo(new EvaluationResult(true, Reason.RULE_MATCH, 1));
    }

    @Test
    void stopsEvaluatingAfterTheFirstMatch() {
        var calls = new ArrayList<Integer>();
        Rule first = recording(calls, 0, true);
        Rule second = recording(calls, 1, true);

        evaluator.evaluate(flag(true, false, first, second), user("u_1"));

        assertThat(calls).containsExactly(0);
    }

    @Test
    void passesTheFlagKeyToRules() {
        var seenKeys = new ArrayList<String>();
        Rule rule = new Rule() {
            @Override
            public boolean matches(String flagKey, EvaluationContext context) {
                seenKeys.add(flagKey);
                return false;
            }

            @Override
            public boolean serve() {
                return true;
            }
        };

        evaluator.evaluate(new FlagConfig("beta-reports", true, List.of(rule), false), user("u_1"));

        assertThat(seenKeys).containsExactly("beta-reports");
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void noRulesServesOtherwise(boolean otherwise) {
        var result = evaluator.evaluate(flag(true, otherwise), user("u_1"));

        assertThat(result).isEqualTo(new EvaluationResult(otherwise, Reason.OTHERWISE, null));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void noMatchingRuleServesOtherwise(boolean otherwise) {
        var flag = flag(true, otherwise, new UserIdIn(Set.of("u_102")), new PercentRollout(0));

        var result = evaluator.evaluate(flag, user("u_999"));

        assertThat(result).isEqualTo(new EvaluationResult(otherwise, Reason.OTHERWISE, null));
    }

    @Test
    void anonymousContextSkipsUserRulesAndFallsThrough() {
        var flag = flag(true, false, new UserIdIn(Set.of("u_102")), new PercentRollout(100));

        var result = evaluator.evaluate(flag, anonymous());

        assertThat(result).isEqualTo(new EvaluationResult(false, Reason.OTHERWISE, null));
    }

    @Test
    void sameInputsAlwaysGiveTheSameResult() {
        var flag = flag(true, false, new PercentRollout(50));
        var context = user("u_42");

        var first = evaluator.evaluate(flag, context);
        for (int i = 0; i < 100; i++) {
            assertThat(new Evaluator().evaluate(flag, context)).isEqualTo(first);
        }
    }

    @Test
    void rejectsNullFlagOrContext() {
        assertThatNullPointerException().isThrownBy(() -> evaluator.evaluate(null, user("u_1")));
        assertThatNullPointerException().isThrownBy(() -> evaluator.evaluate(flag(true, false), null));
    }

    private static Rule recording(List<Integer> calls, int id, boolean matches) {
        return new Rule() {
            @Override
            public boolean matches(String flagKey, EvaluationContext context) {
                calls.add(id);
                return matches;
            }

            @Override
            public boolean serve() {
                return true;
            }
        };
    }
}
