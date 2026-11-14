package dev.flags.backend.flags;

import dev.flags.backend.flags.rules.RuleSpec;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/flags")
class FlagController {

    static final String KEY_PATTERN = "^[a-z0-9][a-z0-9-]{0,62}$";

    record CreateFlagRequest(
            @NotBlank @Pattern(regexp = KEY_PATTERN, message = "must be lowercase letters, digits and dashes, max 63 characters")
                    String key,
            @Size(max = 500) String description) {}

    record UpdateFlagRequest(@NotNull @Size(max = 500) String description) {}

    record SetEnabledRequest(@NotNull Boolean enabled, @NotNull @Min(0) Integer version) {}

    record SetRulesRequest(
            @NotNull @Size(max = 50) List<@NotNull @Valid RuleSpec> rules,
            @NotNull Boolean otherwise,
            @NotNull @Min(0) Integer version) {}

    record EnvironmentView(boolean enabled, boolean otherwise, List<RuleSpec> rules, int version, Instant updatedAt) {
        static EnvironmentView of(FlagEnvironment e) {
            return new EnvironmentView(e.enabled(), e.otherwise(), e.rules(), e.version(), e.updatedAt());
        }
    }

    record FlagView(String key, String description, Instant createdAt, Instant updatedAt,
            Map<String, EnvironmentView> environments) {
        static FlagView of(Flag flag) {
            Map<String, EnvironmentView> envs = new LinkedHashMap<>();
            flag.environments().forEach(e -> envs.put(e.envKey(), EnvironmentView.of(e)));
            return new FlagView(flag.key(), flag.description(), flag.createdAt(), flag.updatedAt(), envs);
        }
    }

    private final FlagService flags;

    FlagController(FlagService flags) {
        this.flags = flags;
    }

    @GetMapping
    List<FlagView> list() {
        return flags.list().stream().map(FlagView::of).toList();
    }

    @GetMapping("/{key}")
    FlagView get(@PathVariable String key) {
        return FlagView.of(flags.get(key));
    }

    @PostMapping
    ResponseEntity<FlagView> create(@Valid @RequestBody CreateFlagRequest body) {
        Flag flag = flags.create(body.key(), body.description() == null ? "" : body.description());
        return ResponseEntity.created(URI.create("/api/flags/" + flag.key())).body(FlagView.of(flag));
    }

    @PatchMapping("/{key}")
    FlagView update(@PathVariable String key, @Valid @RequestBody UpdateFlagRequest body) {
        return FlagView.of(flags.updateDescription(key, body.description()));
    }

    @DeleteMapping("/{key}")
    ResponseEntity<Void> delete(@PathVariable String key) {
        flags.delete(key);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{key}/envs/{env}/enabled")
    EnvironmentView setEnabled(@PathVariable String key, @PathVariable String env, @Valid @RequestBody SetEnabledRequest body) {
        return EnvironmentView.of(flags.setEnabled(key, env, body.enabled(), body.version()));
    }

    @PutMapping("/{key}/envs/{env}/rules")
    EnvironmentView setRules(@PathVariable String key, @PathVariable String env, @Valid @RequestBody SetRulesRequest body) {
        return EnvironmentView.of(flags.setRules(key, env, body.rules(), body.otherwise(), body.version()));
    }
}
