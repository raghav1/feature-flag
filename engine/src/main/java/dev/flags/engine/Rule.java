package dev.flags.engine;

/**
 * One targeting rule. A new kind of rule is a new implementation of this interface; the {@link Evaluator}
 * never needs to know about it.
 */
public interface Rule {

    /** Whether this rule applies to the context. Must be pure: same inputs, same answer. */
    boolean matches(String flagKey, EvaluationContext context);

    /** The value served when this rule is the first one to match. */
    boolean serve();
}
