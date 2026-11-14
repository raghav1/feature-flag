package dev.flags.backend.flags.rules;

import com.fasterxml.jackson.annotation.JsonTypeName;
import dev.flags.engine.Rule;
import dev.flags.engine.rules.UserIdIn;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Set;

@JsonTypeName("users")
public record UsersRule(@NotEmpty @Size(max = 1000) List<@NotBlank String> userIds, Boolean serve) implements RuleSpec {

    public UsersRule {
        serve = RuleSpec.defaultServe(serve);
    }

    @Override
    public String describe() {
        return RuleSpec.withServe("users " + String.join(", ", userIds), serve);
    }

    @Override
    public Rule toEngineRule() {
        return new UserIdIn(Set.copyOf(userIds), serve);
    }
}
