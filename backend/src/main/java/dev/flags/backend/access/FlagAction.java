package dev.flags.backend.access;

/** Flag-level changes. Changing an environment's state is checked separately, with the environment. */
public enum FlagAction {
    CREATE_FLAG("create flags"),
    EDIT_DESCRIPTION("edit flag descriptions"),
    DELETE_FLAG("delete flags");

    private final String description;

    FlagAction(String description) {
        this.description = description;
    }

    String description() {
        return description;
    }
}
