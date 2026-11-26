package dev.flags.backend.evaluation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import dev.flags.backend.ApiTest;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.ResultActions;

/**
 * POST /api/evaluate against the seed data. Seed prod rules for new-dashboard: [users u_102,u_207],
 * [customers acme], [10% rollout]; beta-reports: [customers acme]; dark-mode: disabled in prod.
 */
class EvaluateApiTest extends ApiTest {

    private static final String PROD_KEY = "prod-sdk-key";
    private static final String DEV_KEY = "dev-sdk-key";

    private ResultActions evaluate(String sdkKey, String body) throws Exception {
        var request = post("/api/evaluate").contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(sdkKey == null ? request : request.header("X-SDK-Key", sdkKey));
    }

    private JsonNode evaluateProd(String contextJson) throws Exception {
        return readJson(evaluate(PROD_KEY, "{\"context\":%s}".formatted(contextJson)).andExpect(status().isOk()));
    }

    @ParameterizedTest(name = "{0}: new-dashboard={1} via {2} {3}, beta-reports={4} {5}")
    @CsvSource(nullValues = "-", textBlock = """
            u_102, true,  RULE_MATCH, users,     false, OTHERWISE, -
            u_207, true,  RULE_MATCH, users,     true,  RULE_MATCH, acme
            u_350, true,  RULE_MATCH, customers, true,  RULE_MATCH, acme
            u_303, true,  RULE_MATCH, percent,   false, OTHERWISE, zenith
            u_412, false, OTHERWISE,  -,         false, OTHERWISE, zenith
            """)
    void eachDemoUserTakesTheirOwnPath(String userId, boolean dashboard, String dashboardReason, String ruleType,
            boolean beta, String betaReason, String customer) throws Exception {
        String attributes = customer == null ? "{}" : "{\"customer\":\"%s\"}".formatted(customer);
        JsonNode flags = evaluateProd("{\"userId\":\"%s\",\"attributes\":%s}".formatted(userId, attributes)).path("flags");

        assertThat(flags.at("/new-dashboard/value").asBoolean()).isEqualTo(dashboard);
        assertThat(flags.at("/new-dashboard/reason").asText()).isEqualTo(dashboardReason);
        if (ruleType != null) {
            assertThat(flags.at("/new-dashboard/ruleType").asText()).isEqualTo(ruleType);
        } else {
            assertThat(flags.at("/new-dashboard").has("ruleType")).isFalse();
            assertThat(flags.at("/new-dashboard").has("ruleIndex")).isFalse();
        }
        assertThat(flags.at("/beta-reports/value").asBoolean()).isEqualTo(beta);
        assertThat(flags.at("/beta-reports/reason").asText()).isEqualTo(betaReason);
        assertThat(flags.at("/dark-mode/reason").asText()).isEqualTo("FLAG_OFF");
    }

    @Test
    void ruleIndexIsZeroBased() throws Exception {
        JsonNode flags = evaluateProd("{\"userId\":\"u_303\"}").path("flags");

        assertThat(flags.at("/new-dashboard/ruleIndex").asInt()).isEqualTo(2);
    }

    @Test
    void responseContainsResultsOnlyNeverRules() throws Exception {
        String body = evaluate(PROD_KEY, "{\"context\":{\"userId\":\"u_412\",\"attributes\":{\"customer\":\"zenith\"}}}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        Set<String> fields = new HashSet<>();
        collectFieldNames(json.readTree(body).path("flags"), fields, 0);
        assertThat(fields).isSubsetOf("value", "reason", "ruleIndex", "ruleType");
        // Seed targeting lists and rule settings must not appear anywhere.
        for (String secret : new String[] {"u_102", "u_207", "acme", "percent\":", "userIds", "customerIds", "otherwise", "rules"}) {
            assertThat(body).as("leaks %s", secret).doesNotContain(secret);
        }
    }

    /** Field names below each flag result (depth 0 is the flag-key map itself). */
    private static void collectFieldNames(JsonNode node, Set<String> into, int depth) {
        for (Iterator<String> names = node.fieldNames(); names.hasNext(); ) {
            String name = names.next();
            if (depth > 0) {
                into.add(name);
            }
            collectFieldNames(node.get(name), into, depth + 1);
        }
    }

    @Test
    void sdkKeyIsRequired() throws Exception {
        evaluate(null, "{}").andExpect(status().isUnauthorized());
        evaluate("", "{}").andExpect(status().isUnauthorized());
        evaluate("not-a-key", "{}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Missing or unknown SDK key."));
    }

    @Test
    void theKeyDecidesTheEnvironment() throws Exception {
        evaluate(DEV_KEY, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.environment").value("dev"))
                .andExpect(jsonPath("$.flags.dark-mode.value").value(true))
                .andExpect(jsonPath("$.flags.dark-mode.reason").value("OTHERWISE"));
        evaluate(PROD_KEY, "{}")
                .andExpect(jsonPath("$.environment").value("prod"))
                .andExpect(jsonPath("$.flags.dark-mode.value").value(false));
    }

    @Test
    void needsNoLoginAndNoCsrfToken() throws Exception {
        evaluate(PROD_KEY, "{}").andExpect(status().isOk()); // no session, no csrf()
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "{}",
        "{\"context\":null}",
        "{\"context\":{}}",
        "{\"context\":{\"userId\":null,\"attributes\":null}}",
        "{\"context\":{\"userId\":\"   \"}}",
        "{\"context\":{\"userId\":\"u_412\",\"attributes\":{\"customer\":null}}}",
        "{\"context\":{\"attributes\":{\"customer\":\"acme\"}},\"flags\":null}",
    })
    void missingPiecesAreNormalisedNotCrashes(String body) throws Exception {
        evaluate(PROD_KEY, body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.new-dashboard.value").isBoolean());
    }

    @Test
    void anonymousCustomerStillMatchesCustomerRules() throws Exception {
        JsonNode flags = evaluateProd("{\"attributes\":{\"customer\":\"acme\"}}").path("flags");

        assertThat(flags.at("/beta-reports/value").asBoolean()).isTrue();
        assertThat(flags.at("/new-dashboard/ruleType").asText()).isEqualTo("customers");
    }

    @Test
    void canAskForSomeFlagsAndUnknownOnesAreOffNotErrors() throws Exception {
        evaluate(PROD_KEY, "{\"flags\":[\"beta-reports\",\"no-such-flag\"]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.length()").value(2))
                .andExpect(jsonPath("$.flags.beta-reports.reason").value("OTHERWISE"))
                .andExpect(jsonPath("$.flags.no-such-flag.value").value(false))
                .andExpect(jsonPath("$.flags.no-such-flag.reason").value("FLAG_NOT_FOUND"));
    }

    @Test
    void invalidRequestIs400() throws Exception {
        evaluate(PROD_KEY, "{\"flags\":[\"\"]}").andExpect(status().isBadRequest());
        evaluate(PROD_KEY, "{nope").andExpect(status().isBadRequest());
    }

    private static final String COUNTRY_RULE =
            "[{\"type\":\"attribute\",\"attribute\":\"country\",\"operator\":\"in\",\"values\":[\"US\",\"CA\"]}]";

    private String prodFlagWithCountryRule() throws Exception {
        MockHttpSession admin = login("admin");
        String key = createFlag(admin, uniqueKey("geo"));
        putRules(admin, key, "prod", COUNTRY_RULE, false, 0).andExpect(status().isOk());
        putEnabled(admin, key, "prod", true, 1).andExpect(status().isOk());
        return key;
    }

    @ParameterizedTest(name = "country {0}: value={1} reason={2}")
    @CsvSource(nullValues = "-", textBlock = """
            CA, true,  RULE_MATCH
            DE, false, OTHERWISE
            -,  false, OTHERWISE
            """)
    void attributeRuleMatchesOnTheContextAttribute(String country, boolean value, String reason) throws Exception {
        String key = prodFlagWithCountryRule();
        String attributes = country == null ? "{}" : "{\"country\":\"%s\"}".formatted(country);

        JsonNode result = readJson(evaluate(PROD_KEY, "{\"context\":{\"userId\":\"u_412\",\"attributes\":%s},\"flags\":[\"%s\"]}"
                        .formatted(attributes, key)).andExpect(status().isOk()))
                .path("flags").path(key);

        assertThat(result.path("value").asBoolean()).isEqualTo(value);
        assertThat(result.path("reason").asText()).isEqualTo(reason);
        if (value) {
            assertThat(result.path("ruleType").asText()).isEqualTo("attribute");
            assertThat(result.path("ruleIndex").asInt()).isZero();
        } else {
            assertThat(result.has("ruleType")).isFalse();
        }
    }

    @ParameterizedTest(name = "attributes {0}")
    @ValueSource(strings = {"{\"country\":\"CA\"}", "{\"plan\":\"pro\"}"})
    void attributeRuleNameAndValuesNeverReachTheResponse(String attributes) throws Exception {
        String key = prodFlagWithCountryRule();

        String body = evaluate(PROD_KEY, "{\"context\":{\"userId\":\"u_412\",\"attributes\":%s},\"flags\":[\"%s\"]}".formatted(attributes, key))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        if (attributes.contains("CA")) {
            assertThat(json.readTree(body).at("/flags/" + key + "/ruleType").asText()).as("matched").isEqualTo("attribute");
        }

        for (String secret : new String[] {"country", "\"US\"", "\"CA\"", "operator", "values"}) {
            assertThat(body).as("leaks %s", secret).doesNotContain(secret);
        }
    }

    @Test
    void reflectsAdminChangesImmediately() throws Exception {
        MockHttpSession admin = login("admin");
        String key = createFlag(admin, uniqueKey("live"));
        String request = "{\"context\":{\"userId\":\"u_412\"},\"flags\":[\"%s\"]}".formatted(key);

        evaluate(PROD_KEY, request).andExpect(jsonPath("$.flags['%s'].reason".formatted(key)).value("FLAG_OFF"));

        putRules(admin, key, "prod", "[{\"type\":\"users\",\"userIds\":[\"u_412\"]}]", false, 0).andExpect(status().isOk());
        putEnabled(admin, key, "prod", true, 1).andExpect(status().isOk());

        evaluate(PROD_KEY, request)
                .andExpect(jsonPath("$.flags['%s'].value".formatted(key)).value(true))
                .andExpect(jsonPath("$.flags['%s'].ruleType".formatted(key)).value("users"));
    }
}
