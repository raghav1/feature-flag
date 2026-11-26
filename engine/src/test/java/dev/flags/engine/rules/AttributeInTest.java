package dev.flags.engine.rules;

import static dev.flags.engine.Contexts.anonymous;
import static dev.flags.engine.Contexts.user;
import static dev.flags.engine.rules.AttributeIn.Operator.IN;
import static dev.flags.engine.rules.AttributeIn.Operator.NOT_IN;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import dev.flags.engine.EvaluationContext;
import dev.flags.engine.EvaluationResult;
import dev.flags.engine.Evaluator;
import dev.flags.engine.FlagConfig;
import dev.flags.engine.Reason;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class AttributeInTest {

    private final AttributeIn countryIn = new AttributeIn("country", IN, Set.of("US", "CA"));
    private final AttributeIn countryNotIn = new AttributeIn("country", NOT_IN, Set.of("US"));

    @Test
    void inMatchesOnlyListedValues() {
        assertThat(countryIn.matches("f", user("u_1", "country", "US"))).isTrue();
        assertThat(countryIn.matches("f", user("u_1", "country", "CA"))).isTrue();
        assertThat(countryIn.matches("f", user("u_1", "country", "DE"))).isFalse();
    }

    @Test
    void notInMatchesOtherValues() {
        assertThat(countryNotIn.matches("f", user("u_1", "country", "DE"))).isTrue();
        assertThat(countryNotIn.matches("f", user("u_1", "country", "US"))).isFalse();
    }

    @Test
    void missingAttributeNeverMatchesEitherOperator() {
        for (AttributeIn rule : new AttributeIn[] {countryIn, countryNotIn}) {
            assertThat(rule.matches("f", user("u_1"))).as("no attributes, %s", rule.operator()).isFalse();
            assertThat(rule.matches("f", anonymous())).as("anonymous, %s", rule.operator()).isFalse();
            assertThat(rule.matches("f", user("u_1", "plan", "pro"))).as("other attribute, %s", rule.operator()).isFalse();
        }
    }

    @Test
    void blankValueNeverMatchesEitherOperator() {
        for (AttributeIn rule : new AttributeIn[] {countryIn, countryNotIn}) {
            assertThat(rule.matches("f", user("u_1", "country", ""))).as("empty, %s", rule.operator()).isFalse();
            assertThat(rule.matches("f", user("u_1", "country", "  "))).as("spaces, %s", rule.operator()).isFalse();
        }
    }

    @Test
    void matchingIsExactAndCaseSensitive() {
        assertThat(countryIn.matches("f", user("u_1", "country", "us"))).isFalse();
        assertThat(countryIn.matches("f", user("u_1", "country", " US"))).isFalse();
        assertThat(countryNotIn.matches("f", user("u_1", "country", "us"))).isTrue();
    }

    @Test
    void ignoresTheSameValueUnderAnotherAttribute() {
        assertThat(countryIn.matches("f", user("u_1", "region", "US"))).isFalse();
    }

    @Test
    void worksWithoutAUserId() {
        assertThat(countryIn.matches("f", new EvaluationContext(null, Map.of("country", "CA")))).isTrue();
    }

    @Test
    void ignoresTheFlagKey() {
        assertThat(countryIn.matches("a", user("u_1", "country", "US"))).isTrue();
        assertThat(countryIn.matches("b", user("u_1", "country", "US"))).isTrue();
    }

    @Test
    void servesOnByDefaultAndCarriesServeOff() {
        assertThat(countryIn.serve()).isTrue();
        assertThat(new AttributeIn("country", IN, Set.of("US"), false).serve()).isFalse();
    }

    @Test
    void copiesValuesOnTheWayIn() {
        var values = new HashSet<>(Set.of("US"));
        var rule = new AttributeIn("country", IN, values);
        values.add("DE");
        assertThat(rule.matches("f", user("u_1", "country", "DE"))).isFalse();
    }

    @Test
    void rejectsInvalidDefinitions() {
        assertThatIllegalArgumentException().isThrownBy(() -> new AttributeIn("", IN, Set.of("US")));
        assertThatIllegalArgumentException().isThrownBy(() -> new AttributeIn("  ", IN, Set.of("US")));
        assertThatIllegalArgumentException().isThrownBy(() -> new AttributeIn("country", IN, Set.of()));
        assertThatIllegalArgumentException().isThrownBy(() -> new AttributeIn("country", IN, Set.of("")));
        assertThatNullPointerException().isThrownBy(() -> new AttributeIn(null, IN, Set.of("US")));
        assertThatNullPointerException().isThrownBy(() -> new AttributeIn("country", null, Set.of("US")));
        assertThatNullPointerException().isThrownBy(() -> new AttributeIn("country", IN, null));
        var withNull = new HashSet<String>();
        withNull.add(null);
        assertThatIllegalArgumentException().isThrownBy(() -> new AttributeIn("country", IN, withNull));
    }

    @Test
    void worksThroughTheEvaluator() {
        var evaluator = new Evaluator();
        var flag = new FlagConfig("f", true, List.of(
                new AttributeIn("country", NOT_IN, Set.of("US"), false),
                new AttributeIn("country", IN, Set.of("US"))), true);

        EvaluationResult de = evaluator.evaluate(flag, user("u_1", "country", "DE"));
        assertThat(de.value()).isFalse();
        assertThat(de.reason()).isEqualTo(Reason.RULE_MATCH);
        assertThat(de.matchedRuleIndex()).hasValue(0);

        EvaluationResult us = evaluator.evaluate(flag, user("u_1", "country", "US"));
        assertThat(us.value()).isTrue();
        assertThat(us.matchedRuleIndex()).hasValue(1);

        EvaluationResult missing = evaluator.evaluate(flag, user("u_1"));
        assertThat(missing.reason()).isEqualTo(Reason.OTHERWISE);
        assertThat(missing.value()).isTrue();
    }
}
