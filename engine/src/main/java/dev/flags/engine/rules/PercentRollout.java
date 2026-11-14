package dev.flags.engine.rules;

import dev.flags.engine.Bucketing;
import dev.flags.engine.EvaluationContext;
import dev.flags.engine.Rule;

/**
 * Matches a deterministic {@code percent} of users, bucketed by flag key and user ID. Raising the percent only
 * adds users. Contexts without a user ID never match.
 */
public record PercentRollout(int percent, boolean serve) implements Rule {

    public PercentRollout {
        if (percent < 0 || percent > 100) {
            throw new IllegalArgumentException("percent must be between 0 and 100, was " + percent);
        }
    }

    public PercentRollout(int percent) {
        this(percent, true);
    }

    @Override
    public boolean matches(String flagKey, EvaluationContext context) {
        return context.userId()
                .map(userId -> Bucketing.bucket(flagKey, userId) < percent * (Bucketing.BUCKETS / 100))
                .orElse(false);
    }
}
