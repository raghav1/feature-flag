package dev.flags.backend.contexts;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Read-only lookups for the rule editor. Any logged-in user. */
@RestController
@RequestMapping("/api/contexts")
class ContextController {

    record UnseenResponse(List<String> unseen) {}

    private final ContextService contexts;

    ContextController(ContextService contexts) {
        this.contexts = contexts;
    }

    /** Suggestions: seen IDs of this kind containing {@code query}, most recently seen first. */
    @GetMapping
    List<SeenContext> suggest(
            @RequestParam String kind,
            @RequestParam Optional<@Size(max = 128) String> query,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        return contexts.suggest(ContextKind.parse(kind), query.orElse(""), limit);
    }

    /** Which of {@code value} (repeatable) the service has never seen. */
    @GetMapping("/unseen")
    UnseenResponse unseen(@RequestParam String kind, @RequestParam Optional<@Size(max = 1000) List<String>> value) {
        return new UnseenResponse(contexts.unseen(ContextKind.parse(kind), value.orElse(List.of())));
    }
}
