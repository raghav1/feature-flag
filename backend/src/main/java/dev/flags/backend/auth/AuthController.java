package dev.flags.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Login and "who am I". Logout is handled by Spring Security at POST /api/auth/logout. */
@RestController
@RequestMapping("/api/auth")
class AuthController {

    record LoginRequest(@NotBlank String username, @NotBlank String password) {}

    private final AuthService authService;
    private final CurrentUser currentUser;
    private final SecurityContextRepository securityContextRepository;

    AuthController(AuthService authService, CurrentUser currentUser, SecurityContextRepository securityContextRepository) {
        this.authService = authService;
        this.currentUser = currentUser;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/login")
    AppUser login(@Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = authService.authenticate(body.username(), body.password());

        if (request.getSession(false) != null) {
            request.changeSessionId(); // no session fixation
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        return authService.toAppUser(authentication);
    }

    @GetMapping("/me")
    AppUser me() {
        return currentUser.get();
    }
}
