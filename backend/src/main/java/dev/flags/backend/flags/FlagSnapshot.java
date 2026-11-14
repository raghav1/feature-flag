package dev.flags.backend.flags;

/** Flag-level state stored as before/after in the audit log. */
record FlagSnapshot(String key, String description) {

    static FlagSnapshot of(Flag flag) {
        return new FlagSnapshot(flag.key(), flag.description());
    }
}
