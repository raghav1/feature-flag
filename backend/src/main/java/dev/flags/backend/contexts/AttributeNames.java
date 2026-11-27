package dev.flags.backend.contexts;

import java.util.regex.Pattern;

/**
 * The shape a context attribute name must have to be targeted by an attribute rule: lowercase, starting with a
 * letter, e.g. "country" or "app_version". Values use {@link ContextIds}.
 */
public final class AttributeNames {

    public static final String PATTERN = "^[a-z][a-z0-9_]{0,63}$";
    public static final String MESSAGE = "must start with a lowercase letter and use only lowercase letters, digits and _ (max 64)";

    private static final Pattern COMPILED = Pattern.compile(PATTERN);

    private AttributeNames() {}

    public static boolean isValid(String name) {
        return COMPILED.matcher(name).matches();
    }
}
