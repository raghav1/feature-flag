package dev.flags.backend.flags;

/** The shape of a flag key, shared by every API boundary (REST and MCP). */
public final class FlagKeys {

    public static final String PATTERN = "^[a-z0-9][a-z0-9-]{0,62}$";
    public static final String MESSAGE = "must be lowercase letters, digits and dashes, max 63 characters";

    private FlagKeys() {}
}
