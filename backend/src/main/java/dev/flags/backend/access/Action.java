package dev.flags.backend.access;

/** Things a user can try to change. Reading is allowed for every logged-in user. */
public enum Action {
    CREATE_FLAG("create flags"),
    EDIT_DESCRIPTION("edit flag descriptions"),
    DELETE_FLAG("delete flags"),
    CHANGE_ENVIRONMENT("change");

    private final String verb;

    Action(String verb) {
        this.verb = verb;
    }

    String describe(String envKey) {
        return this == CHANGE_ENVIRONMENT ? verb + " " + envKey : verb;
    }
}
