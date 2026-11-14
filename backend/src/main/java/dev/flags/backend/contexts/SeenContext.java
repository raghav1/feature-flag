package dev.flags.backend.contexts;

import java.time.Instant;

/** A user or customer ID the flag service has evaluated, and when it last did. */
public record SeenContext(String value, Instant lastSeen) {}
