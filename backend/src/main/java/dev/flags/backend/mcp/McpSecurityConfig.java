package dev.flags.backend.mcp;

import dev.flags.backend.apikeys.ApiKeyService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;

/**
 * /mcp accepts API keys only: stateless, no cookies, no CSRF (no ambient credentials to forge). Checked before the
 * dashboard's chain, which in turn never accepts keys, so a key can't reach /api and a session can't reach /mcp.
 */
@Configuration
class McpSecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain mcpSecurityFilterChain(HttpSecurity http, ApiKeyService keys) throws Exception {
        return http
                .securityMatcher("/mcp", "/mcp/**")
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(sc -> sc.requireExplicitSave(true))
                .requestCache(AbstractHttpConfigurer::disable)
                .addFilterBefore(new ApiKeyAuthenticationFilter(keys), AnonymousAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                .exceptionHandling(ex -> ex.authenticationEntryPoint((req, res, e) -> {
                    res.setStatus(HttpStatus.UNAUTHORIZED.value());
                    res.setHeader("WWW-Authenticate", "Bearer realm=\"feature-flags\"");
                    res.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                    res.getWriter().write("{\"title\":\"Unauthorized\",\"status\":401,"
                            + "\"detail\":\"Send an API key as 'Authorization: Bearer ffk_...'. Admins create keys in the dashboard.\"}");
                }))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .build();
    }
}
