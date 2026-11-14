package dev.flags.engine;

import java.util.Map;

/** Test shorthand for building evaluation contexts. */
public final class Contexts {

    private Contexts() {}

    public static EvaluationContext user(String userId) {
        return new EvaluationContext(userId, Map.of());
    }

    public static EvaluationContext user(String userId, String attribute, String value) {
        return new EvaluationContext(userId, Map.of(attribute, value));
    }

    public static EvaluationContext anonymous() {
        return EvaluationContext.anonymous();
    }
}
