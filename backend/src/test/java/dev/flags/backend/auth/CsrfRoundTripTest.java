package dev.flags.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import dev.flags.backend.TestcontainersConfig;
import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

/**
 * The SPA's CSRF flow over real HTTP with a real cookie jar: log in, read the XSRF-TOKEN cookie, send it back as
 * X-XSRF-TOKEN. No MockMvc post-processors, so this checks the actual filter chain.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig.class)
class CsrfRoundTripTest {

    @LocalServerPort
    int port;

    private final CookieManager cookies = new CookieManager();
    private final HttpClient http = HttpClient.newBuilder().cookieHandler(cookies).build();

    @BeforeEach
    void logIn() throws Exception {
        var login = send(HttpRequest.newBuilder(uri("/api/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"editor\",\"password\":\"editor-pass\"}")));
        assertThat(login.statusCode()).isEqualTo(200);
    }

    @Test
    void cookieTokenSentBackAsHeaderIsAccepted() throws Exception {
        assertThat(send(HttpRequest.newBuilder(uri("/api/auth/me")).GET()).statusCode()).isEqualTo(200);
        String token = xsrfCookie();
        assertThat(token).isNotBlank();

        var noOp = send(HttpRequest.newBuilder(uri("/api/flags/dark-mode"))
                .header("Content-Type", "application/json")
                .header("X-XSRF-TOKEN", token)
                .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"description\":\"Dark theme, gradual rollout\"}")));

        assertThat(noOp.statusCode()).isEqualTo(200);
    }

    @Test
    void changeWithoutTheHeaderIsRejectedEvenWithTheCookie() throws Exception {
        send(HttpRequest.newBuilder(uri("/api/auth/me")).GET());
        assertThat(xsrfCookie()).isNotBlank();

        var response = send(HttpRequest.newBuilder(uri("/api/flags/dark-mode"))
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"description\":\"x\"}")));

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(response.body()).contains("CSRF");
    }

    @Test
    void wrongTokenIsRejected() throws Exception {
        send(HttpRequest.newBuilder(uri("/api/auth/me")).GET());

        var response = send(HttpRequest.newBuilder(uri("/api/flags/dark-mode"))
                .header("Content-Type", "application/json")
                .header("X-XSRF-TOKEN", "forged")
                .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"description\":\"x\"}")));

        assertThat(response.statusCode()).isEqualTo(403);
    }

    private String xsrfCookie() {
        return cookies.getCookieStore().getCookies().stream()
                .filter(c -> c.getName().equals("XSRF-TOKEN"))
                .map(HttpCookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }
}
