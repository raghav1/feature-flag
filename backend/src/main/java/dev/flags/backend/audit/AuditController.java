package dev.flags.backend.audit;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AuditController {

    private final AuditLog auditLog;

    AuditController(AuditLog auditLog) {
        this.auditLog = auditLog;
    }

    /**
     * The audit trail, newest first. All filters optional: flag, env, q (text in the summary, flag key or actor),
     * action (e.g. FLAG_TOGGLED), actor (person or key). Page back with before=&lt;id of the oldest event you have&gt;.
     */
    @GetMapping("/api/audit")
    List<AuditEvent> list(
            @RequestParam Optional<String> flag,
            @RequestParam Optional<String> env,
            @RequestParam Optional<@Size(max = 200) String> q,
            @RequestParam Optional<String> action,
            @RequestParam Optional<String> actor,
            @RequestParam Optional<@Min(1) Long> before,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return auditLog.search(new AuditQuery(
                present(flag),
                present(env),
                present(q).map(String::strip),
                present(action).map(AuditQuery::parseAction),
                present(actor).map(AuditQuery.ActorType::parse),
                before,
                limit));
    }

    /** Boundary normalisation: "?flag=" means no filter, same as leaving it out. */
    private static Optional<String> present(Optional<String> param) {
        return param.filter(value -> !value.isBlank());
    }
}
