package dev.flags.backend.apikeys;

import dev.flags.backend.auth.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Admin-only key management, through the dashboard session. Keys themselves can't reach this. */
@RestController
@RequestMapping("/api/keys")
class ApiKeyController {

    record CreateKeyRequest(
            @NotNull @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$",
                    message = "must be 1-64 letters, digits, spaces, _ . or -, starting with a letter or digit")
                    String name,
            @NotNull Role role,
            @Min(1) @Max(365) Integer expiresInDays) {

        CreateKeyRequest {
            expiresInDays = expiresInDays == null ? 90 : expiresInDays;
        }
    }

    private final ApiKeyService keys;

    ApiKeyController(ApiKeyService keys) {
        this.keys = keys;
    }

    @GetMapping
    List<ApiKey> list() {
        return keys.list();
    }

    @PostMapping
    ResponseEntity<ApiKeyService.CreatedKey> create(@Valid @RequestBody CreateKeyRequest body) {
        var created = keys.create(body.name().strip(), body.role(), body.expiresInDays());
        return ResponseEntity.created(URI.create("/api/keys/" + created.key().id())).body(created);
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> revoke(@PathVariable long id) {
        keys.revoke(id);
        return ResponseEntity.noContent().build();
    }
}
