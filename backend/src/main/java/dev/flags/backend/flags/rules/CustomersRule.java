package dev.flags.backend.flags.rules;

import com.fasterxml.jackson.annotation.JsonTypeName;
import dev.flags.backend.contexts.ContextIds;
import dev.flags.engine.Rule;
import dev.flags.engine.rules.CustomerIdIn;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Set;

@JsonTypeName("customers")
public record CustomersRule(@NotEmpty @Size(max = 1000) List<@NotBlank @Pattern(regexp = ContextIds.PATTERN, message = ContextIds.MESSAGE) String> customerIds, Boolean serve)
        implements RuleSpec {

    public CustomersRule {
        serve = RuleSpec.defaultServe(serve);
    }

    @Override
    public String describe() {
        return RuleSpec.withServe("customers " + String.join(", ", customerIds), serve);
    }

    @Override
    public Rule toEngineRule() {
        return new CustomerIdIn(Set.copyOf(customerIds), serve);
    }
}
