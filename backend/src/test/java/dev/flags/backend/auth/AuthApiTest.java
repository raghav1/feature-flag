package dev.flags.backend.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.flags.backend.ApiTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class AuthApiTest extends ApiTest {

    @ParameterizedTest(name = "{0} logs in as {1}")
    @CsvSource({"admin, ADMIN", "editor, EDITOR", "viewer, VIEWER"})
    void seededUsersLogInWithTheirRole(String username, String role) throws Exception {
        MockHttpSession session = login(username);

        mvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(username))
                .andExpect(jsonPath("$.role").value(role))
                .andExpect(jsonPath("$.can.createFlag").isBoolean())
                .andExpect(jsonPath("$.can.changeEnvironments").isArray());
    }

    @ParameterizedTest
    @CsvSource({"admin, wrong", "nobody, admin-pass"})
    void badCredentialsAre401(String username, String password) throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Wrong username or password."));
    }

    @Test
    void blankLoginFieldsAre400() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @ParameterizedTest(name = "{0} {1}")
    @CsvSource({
        "GET, /api/auth/me", "GET, /api/flags", "GET, /api/flags/new-dashboard", "GET, /api/environments",
        "GET, /api/audit", "POST, /api/flags", "PATCH, /api/flags/new-dashboard", "DELETE, /api/flags/new-dashboard",
        "PUT, /api/flags/new-dashboard/envs/prod/enabled", "PUT, /api/flags/new-dashboard/envs/prod/rules",
    })
    void everyApiEndpointNeedsALogin(String method, String path) throws Exception {
        mvc.perform(MockMvcRequestBuilders.request(HttpMethod.valueOf(method), path).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthIsPublic() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void logoutEndsTheSession() throws Exception {
        MockHttpSession session = login("admin");

        mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
    }

    @Test
    void changesWithoutACsrfTokenAreRejected() throws Exception {
        MockHttpSession admin = login("admin");

        mvc.perform(put("/api/flags/new-dashboard/envs/dev/enabled").session(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false,\"version\":0}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Missing or invalid CSRF token."));
        mvc.perform(patch("/api/flags/new-dashboard").session(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"description\":\"x\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/flags/new-dashboard").session(admin)).andExpect(status().isForbidden());
    }
}
