package dev.flags.backend.evaluation;

import static org.assertj.core.api.Assertions.assertThat;

import dev.flags.backend.HttpUser;
import dev.flags.backend.TestcontainersConfig;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

/** GET /api/evaluate/stream over a real server, read line by line like a browser's EventSource would. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig.class)
class ChangeStreamApiTest {

    private static final AtomicInteger SEQUENCE = new AtomicInteger();

    @LocalServerPort
    int port;

    private HttpUser admin;
    private Stream prod;
    private Stream dev;

    /** One open SSE connection; its "event:"/"data:" lines are collected into a queue. */
    private final class Stream implements AutoCloseable {
        final BlockingQueue<String> events = new LinkedBlockingQueue<>();
        final InputStream body;

        Stream(String sdkKey) throws Exception {
            HttpResponse<InputStream> response = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://localhost:%d/api/evaluate/stream?sdkKey=%s".formatted(port, sdkKey)))
                            .header("Accept", "text/event-stream").build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            assertThat(response.statusCode()).isEqualTo(200);
            body = response.body();
            Thread reader = new Thread(this::read);
            reader.setDaemon(true);
            reader.start();
        }

        /** Joins "event:" and "data:" lines into "name data" per event; drops keepalive comments. */
        private void read() {
            try (var lines = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
                String name = null;
                for (String line; (line = lines.readLine()) != null; ) {
                    if (line.startsWith("event:")) {
                        name = line.substring(6).trim();
                    } else if (line.startsWith("data:") && name != null) {
                        events.add(name + " " + line.substring(5).trim());
                        name = null;
                    }
                }
            } catch (Exception closed) {
                // stream closed by the test
            }
        }

        String next() throws InterruptedException {
            String event = events.poll(5, TimeUnit.SECONDS);
            assertThat(event).as("an event within 5 s").isNotNull();
            return event;
        }

        @Override
        public void close() throws Exception {
            body.close();
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        admin = HttpUser.login(port, "admin");
        prod = new Stream("prod-sdk-key");
        dev = new Stream("dev-sdk-key");
        assertThat(prod.next()).isEqualTo("ready {\"environment\":\"prod\"}");
        assertThat(dev.next()).isEqualTo("ready {\"environment\":\"dev\"}");
    }

    @AfterEach
    void tearDown() throws Exception {
        prod.close();
        dev.close();
    }

    private String createFlag() throws Exception {
        String key = "stream-" + SEQUENCE.incrementAndGet();
        assertThat(admin.send("POST", "/api/flags", "{\"key\":\"%s\"}".formatted(key)).statusCode()).isEqualTo(201);
        return key;
    }

    private int toggle(HttpUser user, String key, String env, int version) throws Exception {
        return user.send("PUT", "/api/flags/%s/envs/%s/enabled".formatted(key, env), "{\"enabled\":true,\"version\":%d}".formatted(version))
                .statusCode();
    }

    @Test
    void creatingAFlagIsAnnouncedToEveryEnvironment() throws Exception {
        String key = createFlag();

        assertThat(prod.next()).isEqualTo("changed {\"environment\":\"prod\",\"flagKey\":\"%s\"}".formatted(key));
        assertThat(dev.next()).isEqualTo("changed {\"environment\":\"dev\",\"flagKey\":\"%s\"}".formatted(key));
    }

    @Test
    void aProdChangeReachesProdOnly() throws Exception {
        // Different flags for the two changes, so a prod change leaking to dev can't pass for the dev change.
        String prodFlag = createFlag();
        String devFlag = createFlag();
        for (int i = 0; i < 2; i++) {
            prod.next();
            dev.next();
        }

        assertThat(toggle(admin, prodFlag, "prod", 0)).isEqualTo(200);
        assertThat(toggle(admin, devFlag, "dev", 0)).isEqualTo(200);

        assertThat(prod.next()).isEqualTo("changed {\"environment\":\"prod\",\"flagKey\":\"%s\"}".formatted(prodFlag));
        assertThat(dev.next()).isEqualTo("changed {\"environment\":\"dev\",\"flagKey\":\"%s\"}".formatted(devFlag));
    }

    @Test
    void deniedAndNoOpChangesAreNeverAnnounced() throws Exception {
        String denied = createFlag();
        String allowed = createFlag();
        for (int i = 0; i < 2; i++) {
            prod.next();
        }
        HttpUser editor = HttpUser.login(port, "editor");

        assertThat(toggle(editor, denied, "prod", 0)).isEqualTo(403);
        assertThat(admin.send("PUT", "/api/flags/%s/envs/prod/enabled".formatted(denied), "{\"enabled\":false,\"version\":0}").statusCode())
                .as("no-op").isEqualTo(200);
        assertThat(toggle(admin, allowed, "prod", 0)).isEqualTo(200);

        // the first prod event after the two creations is the allowed toggle, not the denied or no-op one
        assertThat(prod.next()).contains(allowed).doesNotContain(denied);
    }

    @Test
    void eventsCarryNoRules() throws Exception {
        String key = createFlag();
        prod.next();

        admin.send("PUT", "/api/flags/%s/envs/prod/rules".formatted(key),
                "{\"rules\":[{\"type\":\"users\",\"userIds\":[\"u_secret\"]}],\"otherwise\":false,\"version\":0}");

        assertThat(prod.next()).isEqualTo("changed {\"environment\":\"prod\",\"flagKey\":\"%s\"}".formatted(key)).doesNotContain("u_secret");
    }

    @Test
    void unknownKeyIs401() throws Exception {
        for (String query : new String[] {"", "?sdkKey=nope"}) {
            var response = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://localhost:%d/api/evaluate/stream%s".formatted(port, query)))
                            .header("Accept", "text/event-stream").build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).as(query).isEqualTo(401);
        }
    }
}
