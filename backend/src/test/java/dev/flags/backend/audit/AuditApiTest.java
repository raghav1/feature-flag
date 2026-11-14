package dev.flags.backend.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import dev.flags.backend.ApiTest;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** GET /api/audit as a searchable, pageable trail across all flags. */
class AuditApiTest extends ApiTest {

    @Autowired
    JdbcClient jdbc;

    private MockHttpSession viewer;
    private String flag;

    /** One flag with a known history: created, rollout 5% then 20% (by editor, dev), turned on in prod (admin). */
    @BeforeEach
    void setUp() throws Exception {
        MockHttpSession admin = login("admin");
        MockHttpSession editor = login("editor");
        viewer = login("viewer");
        flag = createFlag(admin, uniqueKey("searchable"));
        putRules(editor, flag, "dev", "[{\"type\":\"percent\",\"percent\":5}]", false, 0).andExpect(status().isOk());
        putRules(editor, flag, "dev", "[{\"type\":\"percent\",\"percent\":20}]", false, 1).andExpect(status().isOk());
        putEnabled(admin, flag, "prod", true, 0).andExpect(status().isOk());
    }

    private JsonNode search(MockHttpServletRequestBuilder request) throws Exception {
        return readJson(mvc.perform(request.session(viewer)).andExpect(status().isOk()));
    }

    private static List<String> summaries(JsonNode events) {
        List<String> out = new ArrayList<>();
        events.forEach(e -> out.add(e.path("summary").asText()));
        return out;
    }

    @Test
    void textSearchMatchesSummaryFlagKeyAndActorCaseInsensitively() throws Exception {
        assertThat(summaries(search(get("/api/audit").param("flag", flag).param("q", "ROLLOUT 5"))))
                .containsExactly("rollout 5% → 20%");
        assertThat(search(get("/api/audit").param("q", flag.toUpperCase()).param("limit", "200")).size()).isEqualTo(4);
        assertThat(summaries(search(get("/api/audit").param("flag", flag).param("q", "editor"))))
                .containsExactly("rollout 5% → 20%", "added rule: 5% rollout");
    }

    @Test
    void likeWildcardsAreLiteral() throws Exception {
        // "5%" must match the literal text, not "5 followed by anything".
        assertThat(summaries(search(get("/api/audit").param("flag", flag).param("q", "5%"))))
                .containsExactly("rollout 5% → 20%", "added rule: 5% rollout");
        assertThat(search(get("/api/audit").param("flag", flag).param("q", "_")).size())
                .as("no summary, flag key or actor of this flag contains an underscore").isZero();
    }

    @Test
    void filtersByActionEnvironmentAndActorType() throws Exception {
        assertThat(summaries(search(get("/api/audit").param("flag", flag).param("action", "flag_toggled")))).containsExactly("turned ON");
        assertThat(search(get("/api/audit").param("flag", flag).param("env", "dev")).size()).isEqualTo(2);

        jdbc.sql("INSERT INTO audit_event (actor, flag_key, env_key, action, summary) VALUES ('key:release-bot', :f, 'dev', 'FLAG_TOGGLED', 'turned OFF')")
                .param("f", flag)
                .update();
        JsonNode byKeys = search(get("/api/audit").param("flag", flag).param("actor", "key"));
        assertThat(byKeys.size()).isEqualTo(1);
        assertThat(byKeys.path(0).path("actor").asText()).isEqualTo("key:release-bot");
        assertThat(search(get("/api/audit").param("flag", flag).param("actor", "person")).size()).isEqualTo(4);
    }

    @Test
    void pagesBackwardWithABeforeCursorWithoutGapsOrOverlap() throws Exception {
        JsonNode firstPage = search(get("/api/audit").param("flag", flag).param("limit", "2"));
        long oldestOnFirstPage = firstPage.path(1).path("id").asLong();
        JsonNode secondPage = search(get("/api/audit").param("flag", flag).param("limit", "2").param("before", String.valueOf(oldestOnFirstPage)));

        List<String> all = new ArrayList<>(summaries(firstPage));
        all.addAll(summaries(secondPage));
        assertThat(all).containsExactly("turned ON", "rollout 5% → 20%", "added rule: 5% rollout", "created flag");
        assertThat(search(get("/api/audit").param("flag", flag).param("before", String.valueOf(secondPage.path(1).path("id").asLong()))))
                .isEmpty();
    }

    @Test
    void filtersCombine() throws Exception {
        assertThat(summaries(search(get("/api/audit").param("flag", flag).param("env", "dev").param("action", "RULES_UPDATED").param("q", "20"))))
                .containsExactly("rollout 5% → 20%");
    }

    @Test
    void badFiltersAre400() throws Exception {
        mvc.perform(get("/api/audit").param("action", "EXPLODED").session(viewer))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("action must be one of")));
        mvc.perform(get("/api/audit").param("actor", "robot").session(viewer))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("actor must be person or key"));
        mvc.perform(get("/api/audit").param("before", "0").session(viewer)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/audit").param("q", "x".repeat(201)).session(viewer)).andExpect(status().isBadRequest());
    }
}
