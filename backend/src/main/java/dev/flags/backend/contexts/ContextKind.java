package dev.flags.backend.contexts;

import com.fasterxml.jackson.annotation.JsonValue;

/** What a seen ID identifies: a user ID, or a customer (the "customer" attribute). */
public enum ContextKind {
    USER("user"),
    CUSTOMER("customer");

    private final String value;

    ContextKind(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    /** Lenient parse for query parameters: "user" or "customer", any case. */
    public static ContextKind parse(String text) {
        for (ContextKind kind : values()) {
            if (kind.value.equalsIgnoreCase(text)) {
                return kind;
            }
        }
        throw new IllegalArgumentException("kind must be user or customer");
    }
}
