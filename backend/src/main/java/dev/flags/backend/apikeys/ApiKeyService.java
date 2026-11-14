package dev.flags.backend.apikeys;

import dev.flags.backend.access.AccessPolicy;
import dev.flags.backend.auth.AppUser;
import dev.flags.backend.auth.CurrentUser;
import dev.flags.backend.auth.Role;
import dev.flags.backend.error.ConflictException;
import dev.flags.backend.error.NotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Agent keys. Admins create and revoke them; each key acts as one fixed role on the MCP endpoint and is
 * enforced by the same AccessPolicy as a person with that role.
 */
@Service
public class ApiKeyService {

    /** The secret is returned exactly once, here. */
    public record CreatedKey(ApiKey key, String token) {}

    private final ApiKeyRepository keys;
    private final AccessPolicy accessPolicy;
    private final CurrentUser currentUser;
    private final Clock clock;

    ApiKeyService(ApiKeyRepository keys, AccessPolicy accessPolicy, CurrentUser currentUser, Clock clock) {
        this.keys = keys;
        this.accessPolicy = accessPolicy;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    @Transactional
    public CreatedKey create(String name, Role role, int expiresInDays) {
        AppUser admin = currentUser.get();
        accessPolicy.requireKeyManagement(admin);
        if (keys.existsActiveWithName(name)) {
            throw new ConflictException("An active key named '" + name + "' already exists.");
        }
        String token = ApiKeyTokens.newToken();
        ApiKey key = keys.insert(name, role, ApiKeyTokens.displayPrefix(token), ApiKeyTokens.hash(token), admin.username(),
                clock.instant().plus(Duration.ofDays(expiresInDays)));
        return new CreatedKey(key, token);
    }

    @Transactional(readOnly = true)
    public List<ApiKey> list() {
        accessPolicy.requireKeyManagement(currentUser.get());
        return keys.findAll();
    }

    @Transactional
    public void revoke(long id) {
        AppUser admin = currentUser.get();
        accessPolicy.requireKeyManagement(admin);
        if (!keys.revoke(id, admin.username())) {
            throw new NotFoundException("No active key with id " + id + ".");
        }
    }

    /**
     * The identity a bearer token acts as, if it's a live key: "key:&lt;name&gt;" with the key's role. Cheap to
     * call per request: one indexed lookup, plus a last-used update at most once a minute.
     */
    public Optional<AppUser> authenticate(String token) {
        if (!ApiKeyTokens.looksLikeToken(token)) {
            return Optional.empty();
        }
        return keys.findActiveByHash(ApiKeyTokens.hash(token)).map(key -> {
            keys.touch(key.id());
            return new AppUser(key.actor(), key.role(), true);
        });
    }
}
