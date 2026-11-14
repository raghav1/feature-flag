package dev.flags.backend.flags.rules;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonTypeName;
import dev.flags.engine.Rule;

/**
 * A targeting rule as it appears in the admin API and in the flag_environment.rules column. Adding a rule type
 * is a new record (with {@link JsonTypeName} and {@link #toEngineRule()}) plus one {@link JsonSubTypes} line.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(UsersRule.class),
    @JsonSubTypes.Type(CustomersRule.class),
    @JsonSubTypes.Type(PercentRule.class),
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

    static Boolean defaultServe(Boolean serve) {
        return serve == null ? Boolean.TRUE : serve;
    }

    static String withServe(String description, Boolean serve) {
        return Boolean.FALSE.equals(serve) ? description + " (serves OFF)" : description;
    }
}
