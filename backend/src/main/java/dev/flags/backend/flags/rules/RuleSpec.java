package dev.flags.backend.flags.rules;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonTypeName;
import dev.flags.engine.Rule;
import java.util.Arrays;
import java.util.List;

/**
 * A targeting rule as it appears in the admin API and in the flag_environment.rules column. Adding a rule type
 * is a new record (with {@link JsonTypeName} and {@link #toEngineRule()}) plus one {@link JsonSubTypes} line.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(UsersRule.class),
    @JsonSubTypes.Type(CustomersRule.class),
    @JsonSubTypes.Type(PercentRule.class),
    @JsonSubTypes.Type(AttributeRule.class),
})
public interface RuleSpec {

    /** The engine rule this spec describes. */
    Rule toEngineRule();

    /** The JSON "type" name, e.g. "users". Safe to expose: it names the kind of rule, not its targets. */
    @JsonIgnore
    default String typeName() {
        return getClass().getAnnotation(JsonTypeName.class).value();
    }

    /** Value served when this rule matches. Defaults to ON when omitted. */
    Boolean serve();

    /** Plain words for the audit log, e.g. "users u_102, u_207" or "10% rollout". */
    String describe();

    /** Every registered JSON "type" name, in {@link JsonSubTypes} order, e.g. for "unknown rule type" messages. */
    static List<String> typeNames() {
        return Arrays.stream(RuleSpec.class.getAnnotation(JsonSubTypes.class).value())
                .map(type -> type.value().getAnnotation(JsonTypeName.class).value())
                .toList();
    }

    /** "users, customers, percent or attribute": every registered type, for "unknown rule type" messages (REST and MCP). */
    static String typeChoices() {
        List<String> names = typeNames();
        if (names.size() == 1) {
            return names.get(0);
        }
        return String.join(", ", names.subList(0, names.size() - 1)) + " or " + names.get(names.size() - 1);
    }

    static Boolean defaultServe(Boolean serve) {
        return serve == null ? Boolean.TRUE : serve;
    }

    static String withServe(String description, Boolean serve) {
        return Boolean.FALSE.equals(serve) ? description + " (serves OFF)" : description;
    }
}
