package dev.flags.backend.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
class SecurityContextCurrentUser implements CurrentUser {

    @Override
    public AppUser get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new IllegalStateException("no authenticated user");
        }
        return toAppUser(auth);
    }

    static AppUser toAppUser(Authentication auth) {
        Role role = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(a -> a.startsWith("ROLE_"))
                .map(a -> Role.valueOf(a.substring("ROLE_".length())))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("user " + auth.getName() + " has no role"));
        boolean viaApiKey = auth.getAuthorities().stream().anyMatch(a -> AppUser.API_KEY_AUTHORITY.equals(a.getAuthority()));
        return new AppUser(auth.getName(), role, viaApiKey);
    }
}
