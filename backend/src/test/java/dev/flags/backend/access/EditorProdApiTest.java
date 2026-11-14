package dev.flags.backend.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.flags.backend.ApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpSession;

/** An editor must not be able to change prod by any route, while dev keeps working. */
class EditorProdApiTest extends ApiTest {

    private MockHttpSession admin;
    private MockHttpSession editor;
    private String key;

    @BeforeEach
    void setUp() throws Exception {
        admin = login("admin");
        editor = login("editor");
        key = createFlag(admin, uniqueKey("prod-guard"));
    }

    @Test
    void editorCannotTurnProdOn() throws Exception {
        putEnabled(editor, key, "prod", true, 0)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("editor (editor) may not change prod."));

        assertThat(getFlag(admin, key).at("/environments/prod/enabled").asBoolean()).isFalse();
        assertThat(audit(admin, key)).hasSize(1); // only "created flag"
    }

    @Test
    void editorCannotTurnProdOffEither() throws Exception {
        putEnabled(admin, key, "prod", true, 0).andExpect(status().isOk());

        putEnabled(editor, key, "prod", false, 1).andExpect(status().isForbidden());

        assertThat(getFlag(admin, key).at("/environments/prod/enabled").asBoolean()).isTrue();
    }

    @Test
    void editorCannotChangeProdRulesOrOtherwise() throws Exception {
        putRules(editor, key, "prod", "[{\"type\":\"percent\",\"percent\":100}]", true, 0)
                .andExpect(status().isForbidden());

        assertThat(getFlag(admin, key).at("/environments/prod/rules")).isEmpty();
        assertThat(getFlag(admin, key).at("/environments/prod/otherwise").asBoolean()).isFalse();
    }

    @Test
    void editorIsDeniedBeforeTheVersionIsEvenChecked() throws Exception {
        // A wrong version must not leak a 409 (which would confirm the flag's state) ahead of the 403.
        putEnabled(editor, key, "prod", true, 99).andExpect(status().isForbidden());
    }

    @Test
    void editorCannotDeleteAFlagBecauseThatWipesProd() throws Exception {
        mvc.perform(delete("/api/flags/" + key).session(editor).with(csrf())).andExpect(status().isForbidden());

        getFlag(admin, key); // still there
    }

    @ParameterizedTest
    @ValueSource(strings = {"PROD", "Prod", "prod ", "production"})
    void lookalikeEnvironmentNamesAreNotFoundRatherThanAllowed(String env) throws Exception {
        putEnabled(editor, key, env, true, 0).andExpect(status().isNotFound());

        assertThat(getFlag(admin, key).at("/environments/prod/enabled").asBoolean()).isFalse();
    }

    @Test
    void editorCanStillChangeDevOfTheSameFlag() throws Exception {
        putEnabled(editor, key, "prod", true, 0).andExpect(status().isForbidden());

        putEnabled(editor, key, "dev", true, 0).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true));

        assertThat(audit(admin, key).path(0).path("actor").asText()).isEqualTo("editor");
        assertThat(audit(admin, key).path(0).path("envKey").asText()).isEqualTo("dev");
    }
}
