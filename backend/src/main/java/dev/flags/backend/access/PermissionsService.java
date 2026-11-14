package dev.flags.backend.access;

import dev.flags.backend.auth.AppUser;
import dev.flags.backend.environments.Environment;
import dev.flags.backend.environments.EnvironmentService;
import org.springframework.stereotype.Service;

@Service
public class PermissionsService {

    private final AccessPolicy accessPolicy;
    private final EnvironmentService environments;

    PermissionsService(AccessPolicy accessPolicy, EnvironmentService environments) {
        this.accessPolicy = accessPolicy;
        this.environments = environments;
    }

    public Permissions of(AppUser user) {
        return accessPolicy.permissionsFor(user, environments.list().stream().map(Environment::key).toList());
    }
}
