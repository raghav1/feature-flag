package dev.flags.engine;

import java.util.Map;

/**
 * Who a flag is being evaluated for. {@code userId} may be null for anonymous traffic. Everything else
 * (customer, country, plan…) goes in {@code attributes}, so a rule on a new attribute needs no change here.
 */
public record EvaluationContext(String userId, Map<String, String> attributes) {

    public EvaluationContext {
        if (attributes == null) {
            attributes = Map.of();
        } else {
            attributes.forEach((name, value) -> {
                if (name == null) {
                    throw new IllegalArgumentException("attribute names must not be null");
                }
                if (value == null) {
                    throw new IllegalArgumentException("attribute '" + name + "' must not be null");
                }
            });
            attributes = Map.copyOf(attributes);
        }
    }

    /**
     * The attribute's value, or null when absent. Null-check before {@code Set.of(...).contains(...)}:
     * immutable collections throw on a null argument.
     */
    public String attribute(String name) {
        return attributes.get(name);
    }
}
