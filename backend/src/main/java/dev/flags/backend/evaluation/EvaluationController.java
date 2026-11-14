package dev.flags.backend.evaluation;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.flags.backend.contexts.ContextService;
import dev.flags.backend.error.UnauthorizedException;
import dev.flags.engine.EvaluationContext;
import dev.flags.engine.Reason;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Results only, never rules: SDK keys ship in browser bundles, so anything returned here is public. The key
 * decides the environment, so a dev key can't read prod.
 */
@RestController
class EvaluationController {

    static final String SDK_KEY_HEADER = "X-SDK-Key";

    /** Boundary normalisation: absent context is anonymous; absent or null attributes are dropped. */
    record ContextRequest(String userId, @Size(max = 50) Map<String, String> attributes) {
        ContextRequest {
            Map<String, String> present = new LinkedHashMap<>();
            if (attributes != null) {
                attributes.forEach((name, value) -> {
                    if (value != null) {
                        present.put(name, value);
                    }
                });
            }
            attributes = Map.copyOf(present);
        }

        EvaluationContext toEngineContext() {
            return new EvaluationContext(userId, attributes);
        }
    }

    /** {@code flags} absent or empty means every flag. */
    record EvaluateRequest(@Valid ContextRequest context, @Size(max = 200) List<@NotBlank String> flags) {
        EvaluateRequest {
            context = context == null ? new ContextRequest(null, null) : context;
            flags = flags == null ? List.of() : List.copyOf(flags);
        }
    }

    /** ruleIndex and ruleType are omitted unless a rule matched. */
    @JsonInclude(JsonInclude.Include.NON_ABSENT)
    record FlagResult(boolean value, Reason reason, OptionalInt ruleIndex, Optional<String> ruleType) {
        static FlagResult of(FlagEvaluation e) {
            return new FlagResult(e.value(), e.reason(), e.ruleIndex(), e.ruleType());
        }
    }

    record EvaluateResponse(String environment, Map<String, FlagResult> flags) {}

    private final SdkKeys sdkKeys;
    private final EvaluationService evaluation;
    private final ChangeStream changes;
    private final ContextService contexts;

    EvaluationController(SdkKeys sdkKeys, EvaluationService evaluation, ChangeStream changes, ContextService contexts) {
        this.sdkKeys = sdkKeys;
        this.evaluation = evaluation;
        this.changes = changes;
        this.contexts = contexts;
    }

    @PostMapping("/api/evaluate")
    EvaluateResponse evaluate(@RequestHeader(SDK_KEY_HEADER) Optional<String> sdkKey, @Valid @RequestBody EvaluateRequest body) {
        String env = environmentFor(sdkKey);
        EvaluationContext context = body.context().toEngineContext();
        Map<String, FlagResult> results = new LinkedHashMap<>();
        evaluation.evaluate(env, context, body.flags()).forEach((key, result) -> results.put(key, FlagResult.of(result)));
        // Outside evaluate()'s read-only transaction; best effort, never fails the request.
        contexts.recordSeen(context);
        return new EvaluateResponse(env, results);
    }

    /**
     * Server-sent events: "ready" on connect, then "changed" {environment, flagKey} after each committed change
     * that can affect results. The key may come as a query parameter because browsers' EventSource can't set
     * headers; SDK keys are public anyway.
     */
    @GetMapping(path = "/api/evaluate/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(@RequestHeader(SDK_KEY_HEADER) Optional<String> sdkKeyHeader, @RequestParam Optional<String> sdkKey) {
        return changes.subscribe(environmentFor(sdkKeyHeader.or(() -> sdkKey)));
    }

    private String environmentFor(Optional<String> sdkKey) {
        return sdkKey.flatMap(sdkKeys::environmentFor)
                .orElseThrow(() -> new UnauthorizedException("Missing or unknown SDK key."));
    }
}
