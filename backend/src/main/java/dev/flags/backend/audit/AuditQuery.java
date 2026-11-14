package dev.flags.backend.audit;

import java.util.Objects;
import java.util.Optional;

/**
 * A search over the audit trail. Every filter is optional; results are newest first. Paging is by cursor:
 * pass the id of the last event you have as {@code before} to get the ones older than it.
 *
 * @param text matches the summary, flag key or actor, case-insensitively
 */
public record AuditQuery(
        Optional<String> flagKey,
        Optional<String> envKey,
        Optional<String> text,
        Optional<AuditAction> action,
        Optional<ActorType> actorType,
        Optional<Long> before,
        int limit) {

    /** People logged in to the dashboard, or agents using an API key ("key:&lt;name&gt;"). */
    public enum ActorType {
        PERSON,
        KEY;

        public static ActorType parse(String text) {
            return switch (text.strip().toLowerCase()) {
                case "person", "people" -> PERSON;
                case "key", "keys", "agent", "agents" -> KEY;
                default -> throw new IllegalArgumentException("actor must be person or key");
            };
        }
    }

    public AuditQuery {
        Objects.requireNonNull(flagKey);
        Objects.requireNonNull(envKey);
        Objects.requireNonNull(text);
        Objects.requireNonNull(action);
        Objects.requireNonNull(actorType);
        Objects.requireNonNull(before);
        if (limit < 1 || limit > 200) {
            throw new IllegalArgumentException("limit must be between 1 and 200");
        }
    }

    public static AuditQuery latest(int limit) {
        return new AuditQuery(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), limit);
    }

    public static AuditQuery forFlag(Optional<String> flagKey, Optional<String> envKey, int limit) {
        return new AuditQuery(flagKey, envKey, Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), limit);
    }

    /** "turned_on", "FLAG_TOGGLED", "rules_updated"… : the enum name, any case. */
    public static AuditAction parseAction(String text) {
        try {
            return AuditAction.valueOf(text.strip().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "action must be one of FLAG_CREATED, FLAG_UPDATED, FLAG_DELETED, FLAG_TOGGLED, RULES_UPDATED");
        }
    }
}
