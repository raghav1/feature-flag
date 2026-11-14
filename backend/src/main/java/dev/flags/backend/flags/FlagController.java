package dev.flags.backend.flags;

import dev.flags.backend.flags.rules.RuleSpec;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
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

    record CreateFlagRequest(
            @NotBlank @Pattern(regexp = FlagKeys.PATTERN, message = FlagKeys.MESSAGE)
                    String key,
            @Size(max = 500) String description) {

        /** Description is optional on create; absent means empty. */
        CreateFlagRequest {
            description = description == null ? "" : description;
        }
    }

    record UpdateFlagRequest(@NotNull @Size(max = 500) String description) {}

    record SetEnabledRequest(@NotNull Boolean enabled, @NotNull @Min(0) Integer version) {}

    record SetRulesRequest(
            @NotNull @Size(max = 50) List<@NotNull @Valid RuleSpec> rules,
            @NotNull Boolean otherwise,
            @NotNull @Min(0) Integer version) {}

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
        Flag flag = flags.create(body.key(), body.description());
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
    FlagView.EnvironmentView setEnabled(@PathVariable String key, @PathVariable String env, @Valid @RequestBody SetEnabledRequest body) {
        return FlagView.EnvironmentView.of(flags.setEnabled(key, env, body.enabled(), body.version()));
    }

    @PutMapping("/{key}/envs/{env}/rules")
    FlagView.EnvironmentView setRules(@PathVariable String key, @PathVariable String env, @Valid @RequestBody SetRulesRequest body) {
        return FlagView.EnvironmentView.of(flags.setRules(key, env, body.rules(), body.otherwise(), body.version()));
    }
}
