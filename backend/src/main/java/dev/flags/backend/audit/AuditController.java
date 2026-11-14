package dev.flags.backend.audit;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
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
            @RequestParam(required = false) String flag,
            @RequestParam(required = false) String env,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return auditLog.recent(flag, env, limit);
    }
}
