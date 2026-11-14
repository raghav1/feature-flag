package dev.flags.backend.flags;

import java.util.List;

/**
 * Published when a change could alter evaluation results in {@code environments}. Listeners should act only
 * after commit (@TransactionalEventListener), so a rolled-back change is never announced.
 */
public record FlagChanged(String flagKey, List<String> environments) {

    public FlagChanged {
        environments = List.copyOf(environments);
    }
}
