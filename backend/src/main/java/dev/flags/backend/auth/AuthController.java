package dev.flags.backend.auth;

import dev.flags.backend.access.Permissions;
import dev.flags.backend.access.PermissionsService;
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

    /** The user plus what they may change, so the UI can enable the right controls. */
    record MeView(String username, Role role, Permissions can) {}

    private final AuthService authService;
    private final CurrentUser currentUser;
    private final PermissionsService permissions;
    private final SecurityContextRepository securityContextRepository;

    AuthController(AuthService authService, CurrentUser currentUser, PermissionsService permissions,
            SecurityContextRepository securityContextRepository) {
        this.authService = authService;
        this.currentUser = currentUser;
        this.permissions = permissions;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/login")
    MeView login(@Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = authService.authenticate(body.username(), body.password());

        if (request.getSession(false) != null) {
            request.changeSessionId(); // no session fixation
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        return view(authService.toAppUser(authentication));
    }

    @GetMapping("/me")
    MeView me() {
        return view(currentUser.get());
    }

    private MeView view(AppUser user) {
        return new MeView(user.username(), user.role(), permissions.of(user));
    }
}
