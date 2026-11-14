package dev.flags.backend.evaluation;

import java.util.Optional;

/** Maps an SDK key to the one environment it may evaluate. */
interface SdkKeys {

    Optional<String> environmentFor(String sdkKey);
}
