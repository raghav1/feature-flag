package dev.flags.backend.flags;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public record Flag(
        long id, String key, String description, Instant createdAt, Instant updatedAt, List<FlagEnvironment> environments) {

    public Flag {
        environments = List.copyOf(environments);
    }

    public Optional<FlagEnvironment> environment(String envKey) {
        return environments.stream().filter(e -> e.envKey().equals(envKey)).findFirst();
    }
}
