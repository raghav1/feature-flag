package dev.flags.backend.apikeys;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import dev.flags.backend.ApiTest;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.ResultActions;

/** Key management over the dashboard API: admins only, token shown once, never stored or listed. */
class ApiKeyApiTest extends ApiTest {

    private MockHttpSession admin;

    @BeforeEach
    void setUp() throws Exception {
        admin = login("admin");
    }

    private ResultActions create(MockHttpSession session, String body) throws Exception {
        return mvc.perform(post("/api/keys").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void adminCreatesAKeyAndSeesTheTokenExactlyOnce() throws Exception {
        String name = uniqueKey("release-bot");
        JsonNode created = readJson(create(admin, "{\"name\":\"%s\",\"role\":\"EDITOR\"}".formatted(name)).andExpect(status().isCreated()));

        String token = created.path("token").asText();
        assertThat(token).matches("^ffk_[A-Za-z0-9_-]{43}$");
        assertThat(created.at("/key/prefix").asText()).isEqualTo(token.substring(0, 12));
        assertThat(created.at("/key/role").asText()).isEqualTo("EDITOR");
        assertThat(created.at("/key/createdBy").asText()).isEqualTo("admin");
        assertThat(Duration.between(Instant.now(), Instant.parse(created.at("/key/expiresAt").asText())).toDays()).isBetween(89L, 90L);

        String listing = mvc.perform(get("/api/keys").session(admin)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(listing).contains(name).doesNotContain(token).doesNotContain("hash").doesNotContain("secret");
    }

    @Test
    void expiryIsConfigurableWithinAYear() throws Exception {
        JsonNode created = readJson(create(admin, "{\"name\":\"%s\",\"role\":\"VIEWER\",\"expiresInDays\":7}".formatted(uniqueKey("short")))
                .andExpect(status().isCreated()));

        assertThat(Duration.between(Instant.now(), Instant.parse(created.at("/key/expiresAt").asText())).toDays()).isBetween(6L, 7L);
        create(admin, "{\"name\":\"x1\",\"role\":\"VIEWER\",\"expiresInDays\":0}").andExpect(status().isBadRequest());
        create(admin, "{\"name\":\"x2\",\"role\":\"VIEWER\",\"expiresInDays\":366}").andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"editor", "viewer"})
    void onlyAdminsManageKeys(String username) throws Exception {
        MockHttpSession session = login(username);

        create(session, "{\"name\":\"nope\",\"role\":\"VIEWER\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value(username + " (" + username + ") may not manage API keys."));
        mvc.perform(get("/api/keys").session(session)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/keys/1").session(session).with(csrf())).andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"name\":\"\",\"role\":\"VIEWER\"}", "{\"name\":\" leading-space\",\"role\":\"VIEWER\"}",
        "{\"name\":\"ok\",\"role\":\"OWNER\"}", "{\"name\":\"ok\"}"})
    void invalidRequestsAre400(String body) throws Exception {
        create(admin, body).andExpect(status().isBadRequest());
    }

    @Test
    void namesAreUniqueAmongLiveKeysAndFreeAgainAfterRevoking() throws Exception {
        String name = uniqueKey("ci");
        long id = readJson(create(admin, "{\"name\":\"%s\",\"role\":\"VIEWER\"}".formatted(name))).at("/key/id").asLong();

        create(admin, "{\"name\":\"%s\",\"role\":\"VIEWER\"}".formatted(name)).andExpect(status().isConflict());

        mvc.perform(delete("/api/keys/" + id).session(admin).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/keys/" + id).session(admin).with(csrf())).andExpect(status().isNotFound());
        create(admin, "{\"name\":\"%s\",\"role\":\"VIEWER\"}".formatted(name)).andExpect(status().isCreated());

        JsonNode listing = readJson(mvc.perform(get("/api/keys").session(admin)));
        boolean revokedListed = false;
        for (JsonNode key : listing) {
            if (key.path("id").asLong() == id) {
                revokedListed = true;
                assertThat(key.path("revokedBy").asText()).isEqualTo("admin");
                assertThat(key.path("revokedAt").isNull()).isFalse();
            }
        }
        assertThat(revokedListed).as("revoked keys stay listed for the record").isTrue();
    }

    @Test
    void unknownKeyIs404() throws Exception {
        mvc.perform(delete("/api/keys/999999").session(admin).with(csrf())).andExpect(status().isNotFound());
    }
}
