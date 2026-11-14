package dev.flags.backend.flags.rules;

import com.fasterxml.jackson.annotation.JsonTypeName;
import dev.flags.engine.Rule;
import dev.flags.engine.rules.PercentRollout;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

@JsonTypeName("percent")
public record PercentRule(@NotNull @Min(0) @Max(100) Integer percent, Boolean serve) implements RuleSpec {

    public PercentRule {
        serve = RuleSpec.defaultServe(serve);
    }

    @Override
    public String describe() {
        return RuleSpec.withServe(percent + "% rollout", serve);
    }

    @Override
    public Rule toEngineRule() {
        return new PercentRollout(percent, serve);
    }
}
