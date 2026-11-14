package dev.flags.backend.flags.rules;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CustomersRule(@NotEmpty @Size(max = 1000) List<@NotBlank String> customerIds, Boolean serve)
        implements RuleSpec {

    public CustomersRule {
        serve = RuleSpec.defaultServe(serve);
    }

    @Override
    public String describe() {
        return RuleSpec.withServe("customers " + String.join(", ", customerIds), serve);
    }
}
