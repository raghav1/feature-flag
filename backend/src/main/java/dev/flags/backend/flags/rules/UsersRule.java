package dev.flags.backend.flags.rules;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record UsersRule(@NotEmpty @Size(max = 1000) List<@NotBlank String> userIds, Boolean serve) implements RuleSpec {

    public UsersRule {
        serve = RuleSpec.defaultServe(serve);
    }

    @Override
    public String describe() {
        return RuleSpec.withServe("users " + String.join(", ", userIds), serve);
    }
}
