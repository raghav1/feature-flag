package dev.flags.backend.evaluation;

import dev.flags.engine.Reason;
import java.util.Optional;
import java.util.OptionalInt;

/**
 * One flag's result for one context. Deliberately carries no targeting data: the rule's position and kind
 * ("users", "percent"…) explain the result without revealing who else is targeted.
 */
public record FlagEvaluation(boolean value, Reason reason, OptionalInt ruleIndex, Optional<String> ruleType) {

    static FlagEvaluation notFound() {
        return new FlagEvaluation(false, Reason.FLAG_NOT_FOUND, OptionalInt.empty(), Optional.empty());
    }
}
