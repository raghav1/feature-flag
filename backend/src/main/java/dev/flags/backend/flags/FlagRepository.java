package dev.flags.backend.flags;

import java.util.List;
import java.util.Optional;

public interface FlagRepository {

    /** All flags by key, each with its environments in display order. */
    List<Flag> findAll();

    Optional<Flag> findByKey(String key);

    boolean existsByKey(String key);

    /** Inserts the flag plus a disabled row for every environment. */
    Flag insert(String key, String description);

    void updateDescription(long flagId, String description);

    void delete(long flagId);

    /** @return false when {@code expectedVersion} is stale and nothing was written */
    boolean updateEnvironment(long flagId, String envKey, EnvironmentSnapshot state, int expectedVersion);
}
