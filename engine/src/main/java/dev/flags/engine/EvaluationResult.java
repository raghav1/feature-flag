package dev.flags.engine;

import java.util.Objects;

/**
 * @param matchedRuleIndex zero-based index of the matching rule; present only for {@link Reason#RULE_MATCH}
 */
public record EvaluationResult(boolean value, Reason reason, Integer matchedRuleIndex) {

    public EvaluationResult {
        Objects.requireNonNull(reason, "reason must not be null");
        if (reason == Reason.RULE_MATCH && matchedRuleIndex == null) {
            throw new IllegalArgumentException("RULE_MATCH needs a matchedRuleIndex");
        }
        if (reason != Reason.RULE_MATCH && matchedRuleIndex != null) {
            throw new IllegalArgumentException(reason + " must not have a matchedRuleIndex");
        }
        if (matchedRuleIndex != null && matchedRuleIndex < 0) {
            throw new IllegalArgumentException("matchedRuleIndex must not be negative");
        }
    }

    public static EvaluationResult notFound() {
        return new EvaluationResult(false, Reason.FLAG_NOT_FOUND, null);
    }
}
