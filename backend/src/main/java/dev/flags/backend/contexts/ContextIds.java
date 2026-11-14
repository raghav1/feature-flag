package dev.flags.backend.contexts;

import java.util.regex.Pattern;

/**
 * The shape a user or customer ID must have to be targeted by a rule. Wide enough for real IDs (u_102, UUIDs,
 * emails, "org:acme") and strict enough to reject typos like "u 102" or "acme!".
 */
public final class ContextIds {

    public static final String PATTERN = "^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$";
    public static final String MESSAGE = "must start with a letter or digit and use only letters, digits and _ . : @ - (max 128)";

    private static final Pattern COMPILED = Pattern.compile(PATTERN);

    private ContextIds() {}

    public static boolean isValid(String id) {
        return COMPILED.matcher(id).matches();
    }
}
