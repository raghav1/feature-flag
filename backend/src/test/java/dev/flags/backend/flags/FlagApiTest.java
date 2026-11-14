package dev.flags.backend.flags;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import dev.flags.backend.ApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

class FlagApiTest extends ApiTest {

    private MockHttpSession admin;

    @BeforeEach
    void setUp() throws Exception {
        admin = login("admin");
    }

    @Test
    void seedDataIsThere() throws Exception {
        mvc.perform(get("/api/environments").session(admin))
                .andExpect(jsonPath("$[0].key").value("dev"))
                .andExpect(jsonPath("$[1].key").value("prod"));

        mvc.perform(get("/api/flags").session(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key == 'beta-reports')].environments.prod.rules[0].customerIds[0]").value("acme"))
                .andExpect(jsonPath("$[?(@.key == 'dark-mode')].environments.prod.enabled").value(false))
                .andExpect(jsonPath("$[?(@.key == 'new-dashboard')].environments.dev.otherwise").value(true));

        JsonNode dashboard = getFlag(admin, "new-dashboard");
        assertThat(dashboard.at("/environments/prod/rules/0/type").asText()).isEqualTo("users");
        assertThat(dashboard.at("/environments/prod/rules/2/percent").asInt()).isEqualTo(10);
        assertThat(getFlag(admin, "dark-mode").at("/environments/prod/enabled").asBoolean()).isFalse();
    }

    @Test
    void createdFlagIsOffEverywhereWithNoRules() throws Exception {
        String key = uniqueKey("fresh");

        mvc.perform(post("/api/flags").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"%s\",\"description\":\"Fresh\"}".formatted(key)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/flags/" + key))
                .andExpect(jsonPath("$.environments.dev.enabled").value(false))
                .andExpect(jsonPath("$.environments.prod.enabled").value(false))
                .andExpect(jsonPath("$.environments.prod.otherwise").value(false))
                .andExpect(jsonPath("$.environments.prod.rules").isEmpty())
                .andExpect(jsonPath("$.environments.prod.version").value(0));

        assertThat(audit(admin, key).path(0).path("summary").asText()).isEqualTo("created flag");
    }

    @Test
    void missingDescriptionBecomesEmptyAtTheBoundary() throws Exception {
        String key = uniqueKey("nodesc");

        mvc.perform(post("/api/flags").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"%s\",\"description\":null}".formatted(key)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.description").value(""));
    }

    @Test
    void blankAuditFilterMeansNoFilter() throws Exception {
        String key = createFlag(admin, uniqueKey("blankfilter"));

        JsonNode all = readJson(mvc.perform(get("/api/audit").param("flag", "").param("env", " ").param("limit", "200").session(admin)));

        assertThat(all.findValuesAsText("flagKey")).contains(key);
        assertThat(audit(admin, key).path(0).path("envKey").isNull()).as("flag-level entry has null envKey in JSON").isTrue();
    }

    @Test
    void duplicateKeyIs409() throws Exception {
        mvc.perform(post("/api/flags").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"new-dashboard\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("A flag with key 'new-dashboard' already exists."));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Has-Caps", "-leading-dash", "with space", "under_score",
        "a-very-long-key-that-goes-on-and-on-past-the-sixty-three-character-limit"})
    void invalidKeyIs400WithAFieldError(String key) throws Exception {
        mvc.perform(post("/api/flags").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"%s\"}".formatted(key)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("key"));
    }

    @Test
    void rulesAreValidatedAtTheBoundary() throws Exception {
        String key = createFlag(admin, uniqueKey("validate"));

        putRules(admin, key, "dev", "[{\"type\":\"percent\",\"percent\":101}]", false, 0)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("rules[0].percent"));
        putRules(admin, key, "dev", "[{\"type\":\"users\",\"userIds\":[]}]", false, 0)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("rules[0].userIds"));
        putRules(admin, key, "dev", "[{\"type\":\"customers\",\"customerIds\":[\" \"]}]", false, 0)
                .andExpect(status().isBadRequest());
        putRules(admin, key, "dev", "[{\"type\":\"country\",\"countries\":[\"NZ\"]}]", false, 0)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Unknown rule type 'country'. Use users, customers or percent."));

        assertThat(version(admin, key, "dev")).isZero();
    }

    @Test
    void malformedUserAndCustomerIdsAreRejectedWithTheFieldNamed() throws Exception {
        String key = createFlag(admin, uniqueKey("ids"));

        putRules(admin, key, "dev", "[{\"type\":\"users\",\"userIds\":[\"u_102\",\"u 207\"]}]", false, 0)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("rules[0].userIds[1]"))
                .andExpect(jsonPath("$.errors[0].message").value(org.hamcrest.Matchers.startsWith("must start with a letter or digit")));
        putRules(admin, key, "dev", "[{\"type\":\"customers\",\"customerIds\":[\"acme!\"]}]", false, 0)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("rules[0].customerIds[0]"));

        // Unknown but well-formed IDs are allowed: you can target someone before their first visit.
        putRules(admin, key, "dev", "[{\"type\":\"users\",\"userIds\":[\"ufajfhkj\",\"ana@example.com\"]}]", false, 0)
                .andExpect(status().isOk());
    }

    @Test
    void rulesRoundTripInOrderAndServeDefaultsToOn() throws Exception {
        String key = createFlag(admin, uniqueKey("roundtrip"));
        String rules = """
                [{"type":"users","userIds":["u_102","u_207"]},
                 {"type":"customers","customerIds":["acme"],"serve":false},
                 {"type":"percent","percent":10}]""";

        putRules(admin, key, "prod", rules, true, 0)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rules[0].type").value("users"))
                .andExpect(jsonPath("$.rules[0].serve").value(true))
                .andExpect(jsonPath("$.rules[1].serve").value(false))
                .andExpect(jsonPath("$.rules[2].percent").value(10))
                .andExpect(jsonPath("$.otherwise").value(true))
                .andExpect(jsonPath("$.version").value(1));

        assertThat(getFlag(admin, key).at("/environments/dev/version").asInt()).as("dev untouched").isZero();
    }

    @Test
    void auditSaysWhatChangedInPlainWords() throws Exception {
        MockHttpSession editor = login("editor");
        String key = createFlag(admin, uniqueKey("audited"));

        putRules(editor, key, "dev", "[{\"type\":\"percent\",\"percent\":5}]", false, 0).andExpect(status().isOk());
        putRules(editor, key, "dev", "[{\"type\":\"percent\",\"percent\":10}]", false, 1).andExpect(status().isOk());
        putEnabled(admin, key, "prod", true, 0).andExpect(status().isOk());

        JsonNode audit = audit(admin, key);
        assertThat(audit).hasSize(4);
        assertThat(audit.path(0).path("summary").asText()).isEqualTo("turned ON");
        assertThat(audit.path(0).path("actor").asText()).isEqualTo("admin");
        assertThat(audit.path(0).path("envKey").asText()).isEqualTo("prod");
        assertThat(audit.path(1).path("summary").asText()).isEqualTo("rollout 5% → 10%");
        assertThat(audit.path(1).path("actor").asText()).isEqualTo("editor");
        assertThat(audit.path(1).path("action").asText()).isEqualTo("RULES_UPDATED");
        assertThat(audit.path(2).path("summary").asText()).isEqualTo("added rule: 5% rollout");
        assertThat(audit.path(3).path("summary").asText()).isEqualTo("created flag");
    }

    @Test
    void auditCanBeFilteredByEnvironment() throws Exception {
        String key = createFlag(admin, uniqueKey("filtered"));
        putEnabled(admin, key, "dev", true, 0).andExpect(status().isOk());
        putEnabled(admin, key, "prod", true, 0).andExpect(status().isOk());

        JsonNode prodOnly = readJson(mvc.perform(get("/api/audit").param("flag", key).param("env", "prod").session(admin)));

        assertThat(prodOnly).hasSize(1);
        assertThat(prodOnly.path(0).path("envKey").asText()).isEqualTo("prod");
    }

    @Test
    void auditLimitIsBounded() throws Exception {
        mvc.perform(get("/api/audit").param("limit", "0").session(admin)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/audit").param("limit", "201").session(admin)).andExpect(status().isBadRequest());
    }

    @Test
    void staleVersionIs409AndChangesNothing() throws Exception {
        String key = createFlag(admin, uniqueKey("stale"));
        putEnabled(admin, key, "dev", true, 0).andExpect(status().isOk());

        putEnabled(admin, key, "dev", false, 0)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("Reload and try again")));

        assertThat(getFlag(admin, key).at("/environments/dev/enabled").asBoolean()).isTrue();
    }

    @Test
    void noOpChangeKeepsVersionAndWritesNoAudit() throws Exception {
        String key = createFlag(admin, uniqueKey("noop"));

        putEnabled(admin, key, "dev", false, 0).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(0));

        assertThat(audit(admin, key)).hasSize(1);
    }

    @Test
    void unknownFlagOrEnvironmentIs404() throws Exception {
        mvc.perform(get("/api/flags/no-such-flag").session(admin)).andExpect(status().isNotFound());
        putEnabled(admin, "no-such-flag", "dev", true, 0)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No flag 'no-such-flag'."));
        putEnabled(admin, "new-dashboard", "staging", true, 0)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No environment 'staging'."));
    }

    @Test
    void descriptionCanChangeButKeyCannot() throws Exception {
        String key = createFlag(admin, uniqueKey("described"));

        mvc.perform(patch("/api/flags/" + key).session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"Shiny\",\"key\":\"renamed\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.key").value(key))
                .andExpect(jsonPath("$.description").value("Shiny"));

        assertThat(audit(admin, key).path(0).path("summary").asText()).isEqualTo("description \"test flag\" → \"Shiny\"");
    }

    @Test
    void deleteRemovesTheFlagButKeepsItsHistory() throws Exception {
        String key = createFlag(admin, uniqueKey("doomed"));

        mvc.perform(delete("/api/flags/" + key).session(admin).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(get("/api/flags/" + key).session(admin)).andExpect(status().isNotFound());
        JsonNode audit = audit(admin, key);
        assertThat(audit.path(0).path("summary").asText()).isEqualTo("deleted flag");
        assertThat(audit.path(1).path("summary").asText()).isEqualTo("created flag");
    }

    @Test
    void malformedJsonIs400() throws Exception {
        mvc.perform(post("/api/flags").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{nope"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Request body is missing or is not valid JSON for this endpoint."));
    }
}
