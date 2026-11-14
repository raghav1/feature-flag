package dev.flags.backend.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.flags.backend.HttpUser;
import dev.flags.backend.TestcontainersConfig;
import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.spec.McpSchema;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The MCP endpoint end to end, with the SDK's real Streamable HTTP client against a real server: key auth, the
 * tool list, role enforcement through tools, and every dashboard action driven by an agent.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig.class)
class McpApiTest {

    private static final AtomicInteger SEQUENCE = new AtomicInteger();
    private static final String INITIALIZE = """
            {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},
             "clientInfo":{"name":"raw-http","version":"1"}}}""";

    @LocalServerPort
    int port;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ObjectMapper json;

    private HttpUser admin;
    private final List<McpSyncClient> clients = new ArrayList<>();

    @BeforeEach
    void setUp() throws Exception {
        admin = HttpUser.login(port, "admin");
    }

    @AfterEach
    void closeClients() {
        clients.forEach(McpSyncClient::closeGracefully);
    }

    private static String unique(String prefix) {
        return prefix + "-" + SEQUENCE.incrementAndGet();
    }

    /** Creates a key through the dashboard API as admin; returns the token. */
    private String newKey(String name, String role) throws Exception {
        var response = admin.send("POST", "/api/keys", "{\"name\":\"%s\",\"role\":\"%s\"}".formatted(name, role));
        assertThat(response.statusCode()).isEqualTo(201);
        return json.readTree(response.body()).path("token").asText();
    }

    private McpSyncClient connect(String token) {
        var transport = HttpClientStreamableHttpTransport.builder("http://localhost:" + port)
                .endpoint("/mcp")
                .httpRequestCustomizer((builder, method, uri, body, context) -> builder.header("Authorization", "Bearer " + token))
                .build();
        McpSyncClient client = McpClient.sync(transport).requestTimeout(Duration.ofSeconds(15)).build();
        client.initialize();
        clients.add(client);
        return client;
    }

    private McpSyncClient connectAs(String role) throws Exception {
        return connect(newKey(unique(role.toLowerCase() + "-bot"), role));
    }

    private static CallToolResult call(McpSyncClient client, String tool, Map<String, Object> args) {
        return client.callTool(new McpSchema.CallToolRequest(tool, args));
    }

    private JsonNode ok(CallToolResult result) {
        assertThat(result.isError()).as("tool error: %s", text(result)).isFalse();
        return json.valueToTree(result.structuredContent());
    }

    private static String error(CallToolResult result) {
        assertThat(result.isError()).as("expected a tool error, got %s", text(result)).isTrue();
        return text(result);
    }

    private static String text(CallToolResult result) {
        return result.content().stream()
                .filter(McpSchema.TextContent.class::isInstance)
                .map(c -> ((McpSchema.TextContent) c).text())
                .collect(Collectors.joining("\n"));
    }

    private int rawInitialize(String authorization) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/mcp"))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json, text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(INITIALIZE));
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        HttpResponse<String> response = HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 401) {
            assertThat(response.headers().firstValue("WWW-Authenticate")).hasValueSatisfying(v -> assertThat(v).startsWith("Bearer"));
        }
        return response.statusCode();
    }

    // --- authentication -------------------------------------------------------------------------------------

    @Test
    void aValidKeyIsRequired() throws Exception {
        String token = newKey(unique("auth"), "VIEWER");

        assertThat(rawInitialize(null)).isEqualTo(401);
        assertThat(rawInitialize("Bearer nope")).isEqualTo(401);
        assertThat(rawInitialize("Bearer ffk_" + "x".repeat(43))).as("well-formed but unknown").isEqualTo(401);
        assertThat(rawInitialize("Basic " + token)).isEqualTo(401);
        assertThat(rawInitialize("Bearer " + token)).isEqualTo(200);
        assertThat(rawInitialize("bearer " + token)).as("scheme is case-insensitive").isEqualTo(200);
    }

    @Test
    void revokedAndExpiredKeysStopWorkingImmediately() throws Exception {
        String revokedName = unique("revoked");
        String revoked = newKey(revokedName, "VIEWER");
        String expiredName = unique("expired");
        String expired = newKey(expiredName, "VIEWER");
        assertThat(rawInitialize("Bearer " + revoked)).isEqualTo(200);

        long id = jdbc.sql("SELECT id FROM api_key WHERE name = :n").param("n", revokedName).query(Long.class).single();
        assertThat(admin.send("DELETE", "/api/keys/" + id, null).statusCode()).isEqualTo(204);
        jdbc.sql("UPDATE api_key SET expires_at = now() - interval '1 second' WHERE name = :n").param("n", expiredName).update();

        assertThat(rawInitialize("Bearer " + revoked)).isEqualTo(401);
        assertThat(rawInitialize("Bearer " + expired)).isEqualTo(401);
    }

    @Test
    void keysAndSessionsDoNotCross() throws Exception {
        String token = newKey(unique("cross"), "ADMIN");

        var keyOnDashboardApi = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/flags")).header("Authorization", "Bearer " + token).build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(keyOnDashboardApi.statusCode()).as("a key can't use the dashboard API").isEqualTo(401);

        var sessionOnMcp = admin.send("POST", "/mcp", INITIALIZE);
        assertThat(sessionOnMcp.statusCode()).as("a dashboard session can't use /mcp").isEqualTo(401);
    }

    @Test
    void lastUsedIsRecorded() throws Exception {
        String name = unique("used");
        connect(newKey(name, "VIEWER"));

        assertThat(jdbc.sql("SELECT last_used_at IS NOT NULL FROM api_key WHERE name = :n").param("n", name).query(Boolean.class).single())
                .isTrue();
    }

    // --- tools ----------------------------------------------------------------------------------------------

    @Test
    void everyDashboardActionIsATool() throws Exception {
        List<McpSchema.Tool> tools = connectAs("VIEWER").listTools().tools();
        Map<String, McpSchema.Tool> byName = tools.stream().collect(Collectors.toMap(McpSchema.Tool::name, t -> t));

        assertThat(byName.keySet()).containsExactlyInAnyOrder(
                "whoami", "list_environments", "list_flags", "get_flag", "get_audit_log", "suggest_ids", "find_unseen_ids",
                "create_flag", "update_flag_description", "delete_flag", "set_flag_enabled", "set_flag_rules");
        for (String read : Set.of("whoami", "list_environments", "list_flags", "get_flag", "get_audit_log", "suggest_ids", "find_unseen_ids")) {
            assertThat(byName.get(read).annotations().readOnlyHint()).as(read).isTrue();
        }
        assertThat(byName.get("delete_flag").annotations().destructiveHint()).isTrue();
        assertThat(byName.get("set_flag_rules").annotations().destructiveHint()).isTrue();
        assertThat(byName.get("create_flag").annotations().readOnlyHint()).isFalse();
        tools.forEach(t -> assertThat(t.description()).as(t.name()).isNotBlank());
    }

    @ParameterizedTest(name = "{0} key")
    @CsvSource(delimiter = '|', textBlock = """
            ADMIN  | true  | true  | dev,prod
            EDITOR | true  | false | dev
            VIEWER | false | false | ''
            """)
    void whoamiReportsTheKeysIdentityAndPermissions(String role, boolean create, boolean delete, String envs) throws Exception {
        JsonNode me = ok(call(connectAs(role), "whoami", Map.of()));

        assertThat(me.path("name").asText()).startsWith("key:" + role.toLowerCase() + "-bot");
        assertThat(me.path("role").asText()).isEqualTo(role);
        assertThat(me.at("/can/createFlag").asBoolean()).isEqualTo(create);
        assertThat(me.at("/can/deleteFlag").asBoolean()).isEqualTo(delete);
        assertThat(me.at("/can/manageApiKeys").asBoolean()).as("keys never manage keys").isFalse();
        List<String> changeable = new ArrayList<>();
        me.at("/can/changeEnvironments").forEach(e -> changeable.add(e.asText()));
        assertThat(changeable).isEqualTo(envs.isEmpty() ? List.of() : List.of(envs.split(",")));
    }

    /** The same role matrix as the dashboard (RoleMatrixApiTest), enforced through MCP tools. */
    @ParameterizedTest(name = "{0} key: {1} {2} -> {3}")
    @CsvSource(delimiter = '|', textBlock = """
            VIEWER | set_flag_enabled | dev  | may not change dev
            VIEWER | set_flag_enabled | prod | may not change prod
            VIEWER | create_flag      | -    | may not create flags
            VIEWER | delete_flag      | -    | may not delete flags
            EDITOR | set_flag_enabled | prod | may not change prod
            EDITOR | set_flag_rules   | prod | may not change prod
            EDITOR | delete_flag      | -    | may not delete flags
            EDITOR | set_flag_enabled | dev  | OK
            EDITOR | set_flag_rules   | dev  | OK
            ADMIN  | set_flag_enabled | prod | OK
            ADMIN  | set_flag_rules   | prod | OK
            ADMIN  | delete_flag      | -    | OK
            """)
    void theRoleMatrixHoldsThroughMcp(String role, String tool, String env, String expected) throws Exception {
        String flag = unique("matrix");
        assertThat(admin.send("POST", "/api/flags", "{\"key\":\"%s\"}".formatted(flag)).statusCode()).isEqualTo(201);
        McpSyncClient client = connectAs(role);

        CallToolResult result = switch (tool) {
            case "set_flag_enabled" -> call(client, tool, Map.of("key", flag, "environment", env, "enabled", true, "version", 0));
            case "set_flag_rules" -> call(client, tool, Map.of("key", flag, "environment", env, "otherwise", true, "version", 0,
                    "rules", List.of(Map.of("type", "percent", "percent", 10))));
            case "create_flag" -> call(client, tool, Map.of("key", unique("new")));
            case "delete_flag" -> call(client, tool, Map.of("key", flag, "confirm_key", flag));
            default -> throw new IllegalArgumentException(tool);
        };

        if (expected.equals("OK")) {
            ok(result);
            JsonNode audit = json.readTree(admin.send("GET", "/api/audit?flag=" + flag, null).body());
            assertThat(audit.path(0).path("actor").asText()).as("audited under the key's name").startsWith("key:" + role.toLowerCase() + "-bot");
        } else {
            assertThat(error(result)).contains("(" + role.toLowerCase() + ") " + expected);
            JsonNode audit = json.readTree(admin.send("GET", "/api/audit?flag=" + flag, null).body());
            assertThat(audit.size()).as("denied: nothing recorded beyond creation").isEqualTo(1);
        }
    }

    @Test
    void anAdminAgentCanRunAFlagsWholeLifecycle() throws Exception {
        McpSyncClient agent = connectAs("ADMIN");
        String flag = unique("checkout-v2");

        JsonNode created = ok(call(agent, "create_flag", Map.of("key", flag, "description", "New checkout")));
        assertThat(created.at("/environments/prod/enabled").asBoolean()).isFalse();
        assertThat(created.at("/environments/prod/version").asInt()).isZero();

        // Same validation as the dashboard, same field paths.
        String invalid = error(call(agent, "set_flag_rules", Map.of("key", flag, "environment", "prod", "otherwise", false, "version", 0,
                "rules", List.of(Map.of("type", "users", "userIds", List.of("u_102", "not valid!"))))));
        assertThat(invalid)
                .isEqualTo("Invalid rules. rules[0].userIds[1]: must start with a letter or digit and use only letters, "
                        + "digits and _ . : @ - (max 128)");

        JsonNode rules = ok(call(agent, "set_flag_rules", Map.of("key", flag, "environment", "prod", "otherwise", false, "version", 0,
                "rules", List.of(Map.of("type", "users", "userIds", List.of("u_102")), Map.of("type", "percent", "percent", 5)))));
        assertThat(rules.path("version").asInt()).isEqualTo(1);
        assertThat(rules.at("/rules/1/percent").asInt()).isEqualTo(5);

        // Optimistic locking: a stale version is a conflict, not an overwrite.
        assertThat(error(call(agent, "set_flag_enabled", Map.of("key", flag, "environment", "prod", "enabled", true, "version", 0))))
                .contains("Reload and try again");
        ok(call(agent, "set_flag_enabled", Map.of("key", flag, "environment", "prod", "enabled", true, "version", 1)));
        ok(call(agent, "set_flag_rules", Map.of("key", flag, "environment", "prod", "otherwise", false, "version", 2,
                "rules", List.of(Map.of("type", "users", "userIds", List.of("u_102")), Map.of("type", "percent", "percent", 25)))));
        ok(call(agent, "update_flag_description", Map.of("key", flag, "description", "New checkout, 25%")));

        JsonNode fetched = ok(call(agent, "get_flag", Map.of("key", flag)));
        assertThat(fetched.path("description").asText()).isEqualTo("New checkout, 25%");
        assertThat(fetched.at("/environments/prod/enabled").asBoolean()).isTrue();

        List<String> summaries = new ArrayList<>();
        ok(call(agent, "get_audit_log", Map.of("flag", flag))).path("events").forEach(e -> summaries.add(e.path("summary").asText()));
        assertThat(summaries).containsExactly(
                "description \"New checkout\" → \"New checkout, 25%\"",
                "rollout 5% → 25%",
                "turned ON",
                "added rule: users u_102; added rule: 5% rollout",
                "created flag");

        List<String> searched = new ArrayList<>();
        ok(call(agent, "get_audit_log", Map.of("flag", flag, "query", "rollout", "action", "RULES_UPDATED")))
                .path("events").forEach(e -> searched.add(e.path("summary").asText()));
        assertThat(searched).containsExactly("rollout 5% → 25%", "added rule: users u_102; added rule: 5% rollout");
        JsonNode byKeys = ok(call(agent, "get_audit_log", Map.of("flag", flag, "actor", "key", "limit", 2)));
        assertThat(byKeys.path("events").size()).isEqualTo(2);
        long oldest = byKeys.path("events").path(1).path("id").asLong();
        assertThat(ok(call(agent, "get_audit_log", Map.of("flag", flag, "before", (int) oldest))).path("events").size()).isEqualTo(3);

        assertThat(error(call(agent, "delete_flag", Map.of("key", flag, "confirm_key", "something-else")))).contains("confirm_key");
        ok(call(agent, "delete_flag", Map.of("key", flag, "confirm_key", flag)));
        assertThat(error(call(agent, "get_flag", Map.of("key", flag)))).isEqualTo("No flag '" + flag + "'.");
    }

    @Test
    void readToolsReturnTheDashboardsData() throws Exception {
        McpSyncClient agent = connectAs("VIEWER");

        List<String> envs = new ArrayList<>();
        ok(call(agent, "list_environments", Map.of())).path("environments").forEach(e -> envs.add(e.path("key").asText()));
        assertThat(envs).containsExactly("dev", "prod");

        JsonNode flags = ok(call(agent, "list_flags", Map.of())).path("flags");
        List<String> keys = new ArrayList<>();
        flags.forEach(f -> keys.add(f.path("key").asText()));
        assertThat(keys).contains("new-dashboard", "beta-reports", "dark-mode");

        List<String> users = new ArrayList<>();
        ok(call(agent, "suggest_ids", Map.of("kind", "user", "query", "u_3"))).path("suggestions").forEach(s -> users.add(s.path("value").asText()));
        assertThat(users).contains("u_303", "u_350");

        JsonNode unseen = ok(call(agent, "find_unseen_ids", Map.of("kind", "user", "ids", List.of("u_102", "ufajfhkj"))));
        assertThat(unseen.path("unseen").toString()).isEqualTo("[\"ufajfhkj\"]");
    }

    @Test
    void badArgumentsAreToolErrorsNotCrashes() throws Exception {
        McpSyncClient agent = connectAs("ADMIN");

        assertThat(error(call(agent, "get_flag", Map.of()))).isEqualTo("'key' is required.");
        assertThat(error(call(agent, "get_flag", Map.of("key", 42)))).isEqualTo("'key' must be a string.");
        assertThat(error(call(agent, "create_flag", Map.of("key", "Not A Key")))).startsWith("'key' must be lowercase");
        assertThat(error(call(agent, "set_flag_enabled", Map.of("key", "new-dashboard", "environment", "dev", "enabled", "yes", "version", 0))))
                .isEqualTo("'enabled' must be true or false.");
        assertThat(error(call(agent, "set_flag_enabled", Map.of("key", "new-dashboard", "environment", "dev", "enabled", true, "version", 1.5))))
                .isEqualTo("'version' must be a whole number.");
        assertThat(error(call(agent, "set_flag_rules", Map.of("key", "new-dashboard", "environment", "prod", "otherwise", false, "version", 0,
                "rules", List.of(Map.of("type", "country", "countries", List.of("NZ")))))))
                .isEqualTo("Unknown rule type 'country'. Use users, customers or percent.");
        assertThat(error(call(agent, "set_flag_rules", Map.of("key", "new-dashboard", "environment", "prod", "otherwise", false, "version", 0,
                "rules", List.of(Map.of("type", "percent", "percent", 101))))))
                .isEqualTo("Invalid rules. rules[0].percent: must be less than or equal to 100");
        assertThat(error(call(agent, "suggest_ids", Map.of("kind", "team")))).isEqualTo("kind must be user or customer");
        assertThat(error(call(agent, "get_audit_log", Map.of("limit", 500)))).isEqualTo("'limit' must be between 1 and 200.");
        assertThat(error(call(agent, "set_flag_enabled", Map.of("key", "new-dashboard", "environment", "staging", "enabled", true, "version", 0))))
                .isEqualTo("No environment 'staging'.");
    }
}
