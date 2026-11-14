package dev.flags.backend.mcp;

import dev.flags.backend.apikeys.ApiKeyService;
import dev.flags.backend.auth.AppUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * "Authorization: Bearer ffk_..." → authenticated as the key ("key:&lt;name&gt;") with the key's role, the same
 * shape a logged-in user has, so CurrentUser and AccessPolicy work unchanged. Anything else stays
 * unauthenticated and the chain answers 401. Deliberately not a Spring bean: Boot would register a bean filter
 * for every request, not just /mcp.
 */
final class ApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private final ApiKeyService keys;

    ApiKeyAuthenticationFilter(ApiKeyService keys) {
        this.keys = keys;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            keys.authenticate(header.substring(7).strip()).ifPresent(user -> {
                var auth = UsernamePasswordAuthenticationToken.authenticated(
                        user.username(), null, List.of(
                                new SimpleGrantedAuthority("ROLE_" + user.role().name()),
                                new SimpleGrantedAuthority(AppUser.API_KEY_AUTHORITY)));
                var context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(auth);
                SecurityContextHolder.setContext(context);
            });
        }
        chain.doFilter(request, response);
    }
}
