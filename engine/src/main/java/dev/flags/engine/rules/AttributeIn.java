package dev.flags.engine.rules;

import dev.flags.engine.EvaluationContext;
import dev.flags.engine.Rule;
import java.util.Objects;
import java.util.Set;

/**
 * Matches when the context's value for {@code attribute} is in (or, with {@link Operator#NOT_IN}, not in)
 * {@code values}. Matching is exact and case-sensitive. A missing or blank value never matches, for either
 * operator, so "not in" can't select everyone who didn't send the attribute.
 */
public record AttributeIn(String attribute, Operator operator, Set<String> values, boolean serve) implements Rule {

    public enum Operator { IN, NOT_IN }

    public AttributeIn {
        Objects.requireNonNull(attribute, "attribute must not be null");
        if (attribute.isBlank()) {
            throw new IllegalArgumentException("attribute must not be blank");
        }
        Objects.requireNonNull(operator, "operator must not be null");
        values = IdSets.copyOf(values, "values");
    }

    public AttributeIn(String attribute, Operator operator, Set<String> values) {
        this(attribute, operator, values, true);
    }

    @Override
    public boolean matches(String flagKey, EvaluationContext context) {
        return context.attribute(attribute)
                .filter(value -> !value.isBlank())
                .map(value -> values.contains(value) == (operator == Operator.IN))
                .orElse(false);
    }
}
