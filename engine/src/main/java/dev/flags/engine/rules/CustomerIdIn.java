package dev.flags.engine.rules;

import dev.flags.engine.EvaluationContext;
import dev.flags.engine.Rule;
import java.util.Set;

/** Matches when the context's {@value #ATTRIBUTE} attribute is in the list. */
public record CustomerIdIn(Set<String> customerIds, boolean serve) implements Rule {

    public static final String ATTRIBUTE = "customer";

    public CustomerIdIn {
        customerIds = IdSets.copyOf(customerIds, "customerIds");
    }

    public CustomerIdIn(Set<String> customerIds) {
        this(customerIds, true);
    }

    @Override
    public boolean matches(String flagKey, EvaluationContext context) {
        return context.attribute(ATTRIBUTE).map(customerIds::contains).orElse(false);
    }
}
