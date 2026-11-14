package dev.flags.engine;

import java.util.List;
import java.util.Objects;

/** Evaluates a flag for a context. Stateless and thread-safe. */
public final class Evaluator {

    public EvaluationResult evaluate(FlagConfig flag, EvaluationContext context) {
        Objects.requireNonNull(flag, "flag must not be null");
        Objects.requireNonNull(context, "context must not be null");

        if (!flag.enabled()) {
            return new EvaluationResult(false, Reason.FLAG_OFF, null);
        }
        List<Rule> rules = flag.rules();
        for (int i = 0; i < rules.size(); i++) {
            Rule rule = rules.get(i);
            if (rule.matches(flag.key(), context)) {
                return new EvaluationResult(rule.serve(), Reason.RULE_MATCH, i);
            }
        }
        return new EvaluationResult(flag.otherwise(), Reason.OTHERWISE, null);
    }
}
