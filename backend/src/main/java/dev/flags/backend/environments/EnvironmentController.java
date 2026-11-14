package dev.flags.backend.environments;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class EnvironmentController {

    private final EnvironmentService environments;

    EnvironmentController(EnvironmentService environments) {
        this.environments = environments;
    }

    @GetMapping("/api/environments")
    List<Environment> list() {
        return environments.list();
    }
}
