package dev.flags.backend.auth;

import java.util.Optional;

interface UserRepository {

    Optional<StoredUser> findByUsername(String username);
}
