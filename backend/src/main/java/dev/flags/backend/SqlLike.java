package dev.flags.backend;

/** Builds ILIKE patterns from user text, so % and _ typed by a user match literally (use with ESCAPE '\'). */
public final class SqlLike {

    private SqlLike() {}

    public static String contains(String text) {
        return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }
}
