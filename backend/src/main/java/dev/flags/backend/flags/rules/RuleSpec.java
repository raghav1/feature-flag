package dev.flags.backend.flags.rules;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * A targeting rule as it appears in the API and in the flag_environment.rules column. Adding a rule type is a
 * new record here plus one {@link JsonSubTypes} line.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = UsersRule.class, name = "users"),
    @JsonSubTypes.Type(value = CustomersRule.class, name = "customers"),
    @JsonSubTypes.Type(value = PercentRule.class, name = "percent"),
})
public interface RuleSpec {

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
