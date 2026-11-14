package dev.flags.backend.evaluation;

import dev.flags.backend.flags.FlagChanged;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Server-sent "changed" events per environment, so clients refetch instead of polling. Events carry only the
 * flag key and environment, never rules. Sent after commit, so a rolled-back or denied change is never announced.
 * Clients reconnect on their own (EventSource does) when the server closes a stream after {@link #TIMEOUT}.
 */
@Service
public class ChangeStream {

    static final Duration TIMEOUT = Duration.ofMinutes(30);

    record Change(String environment, String flagKey) {}

    private final Map<String, Set<SseEmitter>> subscribers = new ConcurrentHashMap<>();

    public SseEmitter subscribe(String envKey) {
        SseEmitter emitter = new SseEmitter(TIMEOUT.toMillis());
        Set<SseEmitter> forEnv = subscribers.computeIfAbsent(envKey, env -> new CopyOnWriteArraySet<>());
        forEnv.add(emitter);
        Runnable remove = () -> forEnv.remove(emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(e -> remove.run());
        send(forEnv, emitter, SseEmitter.event().name("ready").data(Map.of("environment", envKey)));
        return emitter;
    }

    @TransactionalEventListener
    void onFlagChanged(FlagChanged change) {
        for (String env : change.environments()) {
            Set<SseEmitter> forEnv = subscribers.getOrDefault(env, Set.of());
            forEnv.forEach(emitter ->
                    send(forEnv, emitter, SseEmitter.event().name("changed").data(new Change(env, change.flagKey()))));
        }
    }

    /** A comment line every 20 s keeps proxies from closing idle streams and detects dead clients. */
    @Scheduled(fixedRate = 20_000)
    void heartbeat() {
        subscribers.values().forEach(forEnv ->
                forEnv.forEach(emitter -> send(forEnv, emitter, SseEmitter.event().comment("keepalive"))));
    }

    int subscriberCount(String envKey) {
        return subscribers.getOrDefault(envKey, Set.of()).size();
    }

    private static void send(Set<SseEmitter> forEnv, SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | IllegalStateException e) {
            forEnv.remove(emitter); // client gone or emitter already completed
        }
    }
}
