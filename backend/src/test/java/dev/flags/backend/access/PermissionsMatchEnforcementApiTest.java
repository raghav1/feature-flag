package dev.flags.backend.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import dev.flags.backend.ApiTest;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

/**
 * The UI enables controls from the "can" field of /api/auth/me. This checks, per role, that every promise in
 * "can" matches what the server actually does: allowed means 2xx, not allowed means 403. If they ever drift,
 * the UI would show buttons that fail (or hide ones that work).
 */
class PermissionsMatchEnforcementApiTest extends ApiTest {

    @ParameterizedTest
    @ValueSource(strings = {"admin", "editor", "viewer"})
    void canMatchesEnforcement(String username) throws Exception {
        MockHttpSession admin = login("admin");
        MockHttpSession session = login(username);
        JsonNode can = readJson(mvc.perform(get("/api/auth/me").session(session))).path("can");

        Set<String> changeable = new HashSet<>();
        can.path("changeEnvironments").forEach(env -> changeable.add(env.asText()));
        for (String env : new String[] {"dev", "prod"}) {
            String key = createFlag(admin, uniqueKey("can-" + env));
            int status = putEnabled(session, key, env, true, 0).andReturn().getResponse().getStatus();
            assertThat(status).as("%s toggling %s", username, env).isEqualTo(changeable.contains(env) ? 200 : 403);
        }

        String created = uniqueKey("can-create");
        assertThat(status(post("/api/flags").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"key\":\"%s\"}".formatted(created))))
                .isEqualTo(can.path("createFlag").asBoolean() ? 201 : 403);

        String described = createFlag(admin, uniqueKey("can-describe"));
        assertThat(status(patch("/api/flags/" + described).session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"description\":\"x\"}")))
                .isEqualTo(can.path("editDescription").asBoolean() ? 200 : 403);

        String doomed = createFlag(admin, uniqueKey("can-delete"));
        assertThat(status(delete("/api/flags/" + doomed).session(session).with(csrf())))
                .isEqualTo(can.path("deleteFlag").asBoolean() ? 204 : 403);

        assertThat(status(post("/api/keys").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"%s\",\"role\":\"VIEWER\"}".formatted(uniqueKey("can-key")))))
                .isEqualTo(can.path("manageApiKeys").asBoolean() ? 201 : 403);
    }

    private int status(org.springframework.test.web.servlet.RequestBuilder request) throws Exception {
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }
}
