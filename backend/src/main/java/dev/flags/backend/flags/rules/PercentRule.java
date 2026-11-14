package dev.flags.backend.flags.rules;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record PercentRule(@NotNull @Min(0) @Max(100) Integer percent, Boolean serve) implements RuleSpec {

    public PercentRule {
        serve = RuleSpec.defaultServe(serve);
    }

    @Override
    public String describe() {
        return RuleSpec.withServe(percent + "% rollout", serve);
    }
}
