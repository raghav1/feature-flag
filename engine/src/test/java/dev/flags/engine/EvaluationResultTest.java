package dev.flags.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.util.OptionalInt;
import org.junit.jupiter.api.Test;

class EvaluationResultTest {

    @Test
    void factories() {
        assertThat(EvaluationResult.off()).isEqualTo(new EvaluationResult(false, Reason.FLAG_OFF, OptionalInt.empty()));
        assertThat(EvaluationResult.ruleMatch(true, 2)).isEqualTo(new EvaluationResult(true, Reason.RULE_MATCH, OptionalInt.of(2)));
        assertThat(EvaluationResult.otherwise(true)).isEqualTo(new EvaluationResult(true, Reason.OTHERWISE, OptionalInt.empty()));
        assertThat(EvaluationResult.notFound()).isEqualTo(new EvaluationResult(false, Reason.FLAG_NOT_FOUND, OptionalInt.empty()));
    }

    @Test
    void ruleMatchRequiresARuleIndex() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new EvaluationResult(true, Reason.RULE_MATCH, OptionalInt.empty()));
    }

    @Test
    void otherReasonsMustNotCarryARuleIndex() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new EvaluationResult(true, Reason.OTHERWISE, OptionalInt.of(0)));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new EvaluationResult(false, Reason.FLAG_OFF, OptionalInt.of(0)));
    }

    @Test
    void rejectsNegativeRuleIndex() {
        assertThatIllegalArgumentException().isThrownBy(() -> EvaluationResult.ruleMatch(true, -1));
    }

    @Test
    void rejectsNulls() {
        assertThatNullPointerException().isThrownBy(() -> new EvaluationResult(true, null, OptionalInt.empty()));
        assertThatNullPointerException().isThrownBy(() -> new EvaluationResult(true, Reason.OTHERWISE, null));
    }
}
