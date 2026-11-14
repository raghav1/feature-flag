package dev.flags.engine.rules;

import dev.flags.engine.EvaluationContext;
import dev.flags.engine.Rule;
import java.util.Set;

/** Matches when the context's user ID is in the list. */
public record UserIdIn(Set<String> userIds, boolean serve) implements Rule {

    public UserIdIn {
        userIds = IdSets.copyOf(userIds, "userIds");
    }

    public UserIdIn(Set<String> userIds) {
        this(userIds, true);
    }

    @Override
    public boolean matches(String flagKey, EvaluationContext context) {
        return context.userId() != null && userIds.contains(context.userId());
    }
}
