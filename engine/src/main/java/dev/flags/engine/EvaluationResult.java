package dev.flags.engine;

import java.util.Objects;
import java.util.OptionalInt;

/**
 * @param matchedRuleIndex zero-based index of the matching rule; present exactly when the reason is
 *                         {@link Reason#RULE_MATCH}
 */
public record EvaluationResult(boolean value, Reason reason, OptionalInt matchedRuleIndex) {

    public EvaluationResult {
        Objects.requireNonNull(reason, "reason must not be null");
        Objects.requireNonNull(matchedRuleIndex, "matchedRuleIndex must not be null; use OptionalInt.empty()");
        if ((reason == Reason.RULE_MATCH) != matchedRuleIndex.isPresent()) {
            throw new IllegalArgumentException("matchedRuleIndex must be present exactly for RULE_MATCH, got " + reason);
        }
        if (matchedRuleIndex.isPresent() && matchedRuleIndex.getAsInt() < 0) {
            throw new IllegalArgumentException("matchedRuleIndex must not be negative");
        }
    }

    public static EvaluationResult off() {
        return new EvaluationResult(false, Reason.FLAG_OFF, OptionalInt.empty());
    }

    public static EvaluationResult ruleMatch(boolean value, int ruleIndex) {
        return new EvaluationResult(value, Reason.RULE_MATCH, OptionalInt.of(ruleIndex));
    }

    public static EvaluationResult otherwise(boolean value) {
        return new EvaluationResult(value, Reason.OTHERWISE, OptionalInt.empty());
    }

    public static EvaluationResult notFound() {
        return new EvaluationResult(false, Reason.FLAG_NOT_FOUND, OptionalInt.empty());
    }
}
