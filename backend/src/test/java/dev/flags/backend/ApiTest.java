package dev.flags.backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Base for HTTP tests: real Spring context, real security, real Postgres. Each test makes its own flags. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
public abstract class ApiTest {

    private static final AtomicInteger SEQUENCE = new AtomicInteger();

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    /** Logs in a seeded user (password is "&lt;name&gt;-pass") and returns their session. */
    protected MockHttpSession login(String username) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"%s\",\"password\":\"%s-pass\"}".formatted(username, username)))
                .andExpect(status().isOk())
                .andReturn().getRequest().getSession(false);
    }

    protected static String uniqueKey(String prefix) {
        return prefix + "-" + SEQUENCE.incrementAndGet();
    }

    protected String createFlag(MockHttpSession session, String key) throws Exception {
        mvc.perform(post("/api/flags").session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"%s\",\"description\":\"test flag\"}".formatted(key)))
                .andExpect(status().isCreated());
        return key;
    }

    protected JsonNode getFlag(MockHttpSession session, String key) throws Exception {
        return readJson(mvc.perform(get("/api/flags/" + key).session(session)).andExpect(status().isOk()));
    }

    protected int version(MockHttpSession session, String key, String env) throws Exception {
        return getFlag(session, key).at("/environments/" + env + "/version").asInt();
    }

    /** Audit entries for one flag, newest first. */
    protected JsonNode audit(MockHttpSession session, String key) throws Exception {
        return readJson(mvc.perform(get("/api/audit").param("flag", key).session(session)).andExpect(status().isOk()));
    }

    protected ResultActions putEnabled(MockHttpSession session, String key, String env, boolean enabled, int version)
            throws Exception {
        return mvc.perform(put("/api/flags/%s/envs/%s/enabled".formatted(key, env)).session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":%s,\"version\":%d}".formatted(enabled, version)));
    }

    protected ResultActions putRules(MockHttpSession session, String key, String env, String rulesJson, boolean otherwise,
            int version) throws Exception {
        return mvc.perform(put("/api/flags/%s/envs/%s/rules".formatted(key, env)).session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"rules\":%s,\"otherwise\":%s,\"version\":%d}".formatted(rulesJson, otherwise, version)));
    }

    protected JsonNode readJson(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
