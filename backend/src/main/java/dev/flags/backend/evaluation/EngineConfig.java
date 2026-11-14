package dev.flags.backend.evaluation;

import dev.flags.engine.Evaluator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The engine knows nothing about Spring, so it's wired in here. */
@Configuration
class EngineConfig {

    @Bean
    Evaluator evaluator() {
        return new Evaluator();
    }
}
