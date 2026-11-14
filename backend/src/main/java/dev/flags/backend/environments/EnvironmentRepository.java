package dev.flags.backend.environments;

import java.util.List;

public interface EnvironmentRepository {

    /** In display order. */
    List<Environment> findAll();

    boolean exists(String key);
}
