package dev.flags.backend.flags.rules;

import com.fasterxml.jackson.annotation.JsonTypeName;
import dev.flags.backend.contexts.AttributeNames;
import dev.flags.backend.contexts.ContextIds;
import dev.flags.engine.Rule;
import dev.flags.engine.rules.AttributeIn;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Set;

/**
 * Matches when a context attribute (e.g. "country") is in, or not in, a list of values. {@code operator} is a
 * validated string rather than an enum so an unknown value is a field error ({@code rules[0].operator}) instead of
 * a JSON parse error with no field path.
 */
@JsonTypeName("attribute")
public record AttributeRule(
        @NotNull @Pattern(regexp = AttributeNames.PATTERN, message = AttributeNames.MESSAGE) String attribute,
        @NotNull @Pattern(regexp = IN + "|" + NOT_IN, message = "must be \"in\" or \"not_in\"") String operator,
        @NotEmpty @Size(max = 1000) List<@NotBlank @Pattern(regexp = ContextIds.PATTERN, message = ContextIds.MESSAGE) String> values,
        Boolean serve)
        implements RuleSpec {

    static final String IN = "in";
    static final String NOT_IN = "not_in";

    public AttributeRule {
        serve = RuleSpec.defaultServe(serve);
    }

    @Override
    public String describe() {
        String words = engineOperator() == AttributeIn.Operator.NOT_IN ? "not in" : "in";
        return RuleSpec.withServe(attribute + " " + words + " " + String.join(", ", values), serve);
    }

    @Override
    public Rule toEngineRule() {
        return new AttributeIn(attribute, engineOperator(), Set.copyOf(values), serve);
    }

    /** Explicit on both values: stored rules skip {@code @Valid}, so a typo must fail rather than invert targeting. */
    private AttributeIn.Operator engineOperator() {
        return switch (operator) {
            case IN -> AttributeIn.Operator.IN;
            case NOT_IN -> AttributeIn.Operator.NOT_IN;
            default -> throw new IllegalStateException("Unknown attribute rule operator '" + operator + "'.");
        };
    }
}
