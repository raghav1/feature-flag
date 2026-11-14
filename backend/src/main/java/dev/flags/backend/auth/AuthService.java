package dev.flags.backend.auth;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;

    AuthService(AuthenticationManager authenticationManager) {
        this.authenticationManager = authenticationManager;
    }

    /** @throws org.springframework.security.core.AuthenticationException on bad credentials */
    public Authentication authenticate(String username, String password) {
        return authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(username, password));
    }

    public AppUser toAppUser(Authentication authentication) {
        return SecurityContextCurrentUser.toAppUser(authentication);
    }
}
