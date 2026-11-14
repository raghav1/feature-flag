package dev.flags.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import org.junit.jupiter.api.Test;

class EvaluationResultTest {

    @Test
    void ruleMatchRequiresARuleIndex() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EvaluationResult(true, Reason.RULE_MATCH, null));
    }

    @Test
    void otherReasonsMustNotCarryARuleIndex() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EvaluationResult(true, Reason.OTHERWISE, 0));
        assertThatIllegalArgumentException().isThrownBy(() -> new EvaluationResult(false, Reason.FLAG_OFF, 0));
    }

    @Test
    void rejectsNegativeRuleIndex() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EvaluationResult(true, Reason.RULE_MATCH, -1));
    }

    @Test
    void rejectsNullReason() {
        assertThatNullPointerException().isThrownBy(() -> new EvaluationResult(true, null, null));
    }

    @Test
    void notFoundIsOff() {
        assertThat(EvaluationResult.notFound()).isEqualTo(new EvaluationResult(false, Reason.FLAG_NOT_FOUND, null));
    }
}
