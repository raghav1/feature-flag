package dev.flags.backend;

import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/** A logged-in user over real HTTP (cookie jar + CSRF header), for tests that run a real server. */
public final class HttpUser {

    private final CookieManager cookies = new CookieManager();
    private final HttpClient http = HttpClient.newBuilder().cookieHandler(cookies).build();
    private final String baseUrl;

    private HttpUser(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    /** Logs in a seeded user (password "&lt;name&gt;-pass") and primes the CSRF cookie. */
    public static HttpUser login(int port, String username) throws Exception {
        HttpUser user = new HttpUser("http://localhost:" + port);
        var login = user.send("POST", "/api/auth/login", "{\"username\":\"%s\",\"password\":\"%s-pass\"}".formatted(username, username));
        if (login.statusCode() != 200) {
            throw new IllegalStateException("login failed: " + login.statusCode());
        }
        user.send("GET", "/api/auth/me", null);
        return user;
    }

    public HttpResponse<String> send(String method, String path, String jsonBody) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .method(method, jsonBody == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(jsonBody))
                .header("Content-Type", "application/json");
        cookies.getCookieStore().getCookies().stream()
                .filter(c -> c.getName().equals("XSRF-TOKEN"))
                .map(HttpCookie::getValue)
                .findFirst()
                .ifPresent(token -> request.header("X-XSRF-TOKEN", token));
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
