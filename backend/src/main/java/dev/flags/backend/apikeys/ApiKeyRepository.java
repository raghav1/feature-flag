package dev.flags.backend.apikeys;

import dev.flags.backend.auth.Role;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

interface ApiKeyRepository {

    ApiKey insert(String name, Role role, String prefix, String secretHash, String createdBy, Instant expiresAt);

    /** Newest first, revoked and expired included. */
    List<ApiKey> findAll();

    /** Only a key that is neither revoked nor expired. */
    Optional<ApiKey> findActiveByHash(String secretHash);

    boolean existsActiveWithName(String name);

    /** @return false if no such key, or it was already revoked */
    boolean revoke(long id, String revokedBy);

    /** Records use, at most once a minute per key so busy agents don't write on every call. */
    void touch(long id);
}
