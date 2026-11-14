package dev.flags.backend.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import dev.flags.backend.ApiTest;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

/**
 * Every cell of the role matrix, over real HTTP with real logins. For each denied cell it also checks that
 * nothing changed and nothing was written to the audit log; for each allowed change, that the audit entry names
 * the logged-in user.
 */
class RoleMatrixApiTest extends ApiTest {

    enum Op { READ, TOGGLE_DEV, RULES_DEV, TOGGLE_PROD, RULES_PROD, CREATE, EDIT_DESCRIPTION, DELETE }

    @ParameterizedTest(name = "{0} {1} -> {2}")
    @CsvSource(textBlock = """
            admin,  READ,             200
            editor, READ,             200
            viewer, READ,             200
            admin,  TOGGLE_DEV,       200
            editor, TOGGLE_DEV,       200
            viewer, TOGGLE_DEV,       403
            admin,  RULES_DEV,        200
            editor, RULES_DEV,        200
            viewer, RULES_DEV,        403
            admin,  TOGGLE_PROD,      200
            editor, TOGGLE_PROD,      403
            viewer, TOGGLE_PROD,      403
            admin,  RULES_PROD,       200
            editor, RULES_PROD,       403
            viewer, RULES_PROD,       403
            admin,  CREATE,           201
            editor, CREATE,           201
            viewer, CREATE,           403
            admin,  EDIT_DESCRIPTION, 200
            editor, EDIT_DESCRIPTION, 200
            viewer, EDIT_DESCRIPTION, 403
            admin,  DELETE,           204
            editor, DELETE,           403
            viewer, DELETE,           403
            """)
    void roleMatrix(String username, Op op, int expectedStatus) throws Exception {
        MockHttpSession admin = login("admin");
        MockHttpSession session = login(username);
        String key = createFlag(admin, uniqueKey("matrix"));
        String newKey = uniqueKey("created");
        JsonNode flagBefore = getFlag(admin, key);
        JsonNode auditBefore = audit(admin, key);

        var response = perform(op, session, key, newKey).andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(expectedStatus);
        if (expectedStatus == 403) {
            assertThat(json.readTree(response.getContentAsString()).path("detail").asText())
                    .startsWith(username + " (" + username + ") may not");
            assertThat(getFlag(admin, key)).as("flag unchanged").isEqualTo(flagBefore);
            assertThat(audit(admin, key)).as("no audit entry").isEqualTo(auditBefore);
            assertThat(audit(admin, newKey)).as("no flag created").isEmpty();
        } else if (op != Op.READ) {
            String audited = op == Op.CREATE ? newKey : key;
            assertThat(audit(admin, audited).path(0).path("actor").asText()).isEqualTo(username);
        }
    }

    private org.springframework.test.web.servlet.ResultActions perform(Op op, MockHttpSession s, String key, String newKey)
            throws Exception {
        return switch (op) {
            case READ -> {
                for (String path : new String[] {"/api/flags", "/api/environments", "/api/audit"}) {
                    assertThat(mvc.perform(get(path).session(s)).andReturn().getResponse().getStatus()).as(path).isEqualTo(200);
                }
                yield mvc.perform(get("/api/flags/" + key).session(s));
            }
            case TOGGLE_DEV -> putEnabled(s, key, "dev", true, 0);
            case TOGGLE_PROD -> putEnabled(s, key, "prod", true, 0);
            case RULES_DEV -> putRules(s, key, "dev", "[{\"type\":\"percent\",\"percent\":10}]", false, 0);
            case RULES_PROD -> putRules(s, key, "prod", "[{\"type\":\"percent\",\"percent\":10}]", false, 0);
            case CREATE -> mvc.perform(post("/api/flags").session(s).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"key\":\"%s\"}".formatted(newKey)));
            case EDIT_DESCRIPTION -> mvc.perform(patch("/api/flags/" + key).session(s).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"description\":\"changed\"}"));
            case DELETE -> mvc.perform(delete("/api/flags/" + key).session(s).with(csrf()));
        };
    }
}
