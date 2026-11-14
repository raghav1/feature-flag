package dev.flags.engine;

import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Who a flag is being evaluated for. Everything except the user ID (customer, country, plan…) goes in
 * {@code attributes}, so a rule on a new attribute needs no change here.
 *
 * <p>Absence is normalised once, here: a null or blank user ID means anonymous, a null map means no attributes,
 * and the accessors return {@link Optional}. Rules never see a null.
 */
public final class EvaluationContext {

    private static final EvaluationContext ANONYMOUS = new EvaluationContext(null, Map.of());

    private final String userId; // null when anonymous; never blank
    private final Map<String, String> attributes;

    /**
     * @param userId     null or blank for anonymous traffic
     * @param attributes may be null; must not contain null names or values
     */
    public EvaluationContext(String userId, Map<String, String> attributes) {
        this.userId = userId == null || userId.isBlank() ? null : userId;
        if (attributes == null) {
            this.attributes = Map.of();
        } else {
            attributes.forEach((name, value) -> {
                if (name == null) {
                    throw new IllegalArgumentException("attribute names must not be null");
                }
                if (value == null) {
                    throw new IllegalArgumentException("attribute '" + name + "' must not be null; leave it out instead");
                }
            });
            this.attributes = Map.copyOf(attributes);
        }
    }

    public static EvaluationContext anonymous() {
        return ANONYMOUS;
    }

    public Optional<String> userId() {
        return Optional.ofNullable(userId);
    }

    public Optional<String> attribute(String name) {
        return Optional.ofNullable(attributes.get(name));
    }

    /** Immutable. */
    public Map<String, String> attributes() {
        return attributes;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof EvaluationContext other
                && Objects.equals(userId, other.userId)
                && attributes.equals(other.attributes);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, attributes);
    }

    @Override
    public String toString() {
        return "EvaluationContext[userId=" + userId + ", attributes=" + attributes + "]";
    }
}
