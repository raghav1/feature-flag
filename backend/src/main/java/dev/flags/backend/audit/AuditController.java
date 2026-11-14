package dev.flags.backend.audit;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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

    @GetMapping("/api/audit")
    List<AuditEvent> list(
            @RequestParam Optional<String> flag,
            @RequestParam Optional<String> env,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return auditLog.recent(present(flag), present(env), limit);
    }

    /** Boundary normalisation: "?flag=" means no filter, same as leaving it out. */
    private static Optional<String> present(Optional<String> param) {
        return param.filter(value -> !value.isBlank());
    }
}
