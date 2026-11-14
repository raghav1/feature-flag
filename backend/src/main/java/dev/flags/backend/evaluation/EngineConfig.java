package dev.flags.backend.evaluation;

import dev.flags.engine.Evaluator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** The engine knows nothing about Spring, so it's wired in here. Scheduling drives the stream heartbeat. */
@Configuration
@EnableScheduling
class EngineConfig {

    @Bean
    Evaluator evaluator() {
        return new Evaluator();
    }
}
