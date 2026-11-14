package dev.flags.backend.environments;

import dev.flags.backend.error.NotFoundException;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class EnvironmentService {

    private final EnvironmentRepository environments;

    EnvironmentService(EnvironmentRepository environments) {
        this.environments = environments;
    }

    public List<Environment> list() {
        return environments.findAll();
    }

    /** @throws NotFoundException for an unknown key; keys are matched exactly ("PROD" is not "prod") */
    public void requireExists(String key) {
        if (!environments.exists(key)) {
            throw new NotFoundException("No environment '" + key + "'.");
        }
    }
}
