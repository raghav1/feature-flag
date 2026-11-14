package dev.flags.backend.contexts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import dev.flags.backend.ApiTest;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

class ContextApiTest extends ApiTest {

    private MockHttpSession viewer;

    @BeforeEach
    void setUp() throws Exception {
        viewer = login("viewer");
    }

    private List<String> suggest(String kind, String query) throws Exception {
        var request = get("/api/contexts").param("kind", kind).param("limit", "100").session(viewer);
        if (query != null) {
            request.param("query", query);
        }
        JsonNode body = readJson(mvc.perform(request).andExpect(status().isOk()));
        List<String> values = new ArrayList<>();
        body.forEach(node -> values.add(node.path("value").asText()));
        return values;
    }

    private void evaluateAs(String userId, String customer) throws Exception {
        mvc.perform(post("/api/evaluate").header("X-SDK-Key", "dev-sdk-key").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"context\":{\"userId\":%s,\"attributes\":{\"customer\":%s}}}".formatted(
                                userId == null ? "null" : "\"" + userId + "\"", customer == null ? "null" : "\"" + customer + "\"")))
                .andExpect(status().isOk());
    }

    @Test
    void seedDemoUsersAndCustomersAreSuggested() throws Exception {
        assertThat(suggest("user", null)).contains("u_102", "u_207", "u_303", "u_350", "u_412");
        assertThat(suggest("customer", null)).contains("acme", "zenith");
    }

    @Test
    void queryMatchesAnywhereCaseInsensitively() throws Exception {
        assertThat(suggest("user", "U_3")).contains("u_303", "u_350").doesNotContain("u_102");
        assertThat(suggest("customer", "CM")).containsExactly("acme");
    }

    @Test
    void likeWildcardsInTheQueryAreLiteral() throws Exception {
        assertThat(suggest("customer", "_")).isEmpty(); // no customer contains an underscore
        assertThat(suggest("customer", "%")).isEmpty();
    }

    @Test
    void evaluatedUsersAndCustomersBecomeSuggestionsMostRecentFirst() throws Exception {
        evaluateAs("u_first_9001", "globe-corp");
        evaluateAs("u_second_9002", null);

        List<String> users = suggest("user", "_900");
        assertThat(users).containsExactly("u_second_9002", "u_first_9001");
        assertThat(suggest("customer", "globe")).containsExactly("globe-corp");
    }

    @Test
    void malformedIdsAreEvaluatedButNotRecorded() throws Exception {
        evaluateAs("not a valid id!", "bad customer");

        assertThat(suggest("user", "valid id")).isEmpty();
        assertThat(suggest("customer", "bad customer")).isEmpty();
    }

    @Test
    void unseenListsTheIdsNeverEvaluatedOnceEachInOrder() throws Exception {
        mvc.perform(get("/api/contexts/unseen").param("kind", "user")
                        .param("value", "u_102", "ufajfhkj", "u_never_seen", "ufajfhkj").session(viewer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unseen.length()").value(2))
                .andExpect(jsonPath("$.unseen[0]").value("ufajfhkj"))
                .andExpect(jsonPath("$.unseen[1]").value("u_never_seen"));
        mvc.perform(get("/api/contexts/unseen").param("kind", "customer").session(viewer))
                .andExpect(jsonPath("$.unseen").isEmpty());
    }

    @Test
    void badKindOrLimitIs400AndLoginIsRequired() throws Exception {
        mvc.perform(get("/api/contexts").param("kind", "team").session(viewer))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("kind must be user or customer"));
        mvc.perform(get("/api/contexts").param("kind", "user").param("limit", "0").session(viewer))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/contexts").param("kind", "user")).andExpect(status().isUnauthorized());
    }
}
