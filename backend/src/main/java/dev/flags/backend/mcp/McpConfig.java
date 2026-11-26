package dev.flags.backend.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.json.jackson2.JacksonMcpJsonMapper;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpStatelessSyncServer;
import io.modelcontextprotocol.server.transport.HttpServletStatelessServerTransport;
import io.modelcontextprotocol.spec.McpSchema;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * The MCP server at /mcp: stateless Streamable HTTP, so every request is authenticated on its own by its API key
 * and there is no MCP session state to protect. Tools are in {@link AdminTools}.
 */
@Configuration
class McpConfig {

    /** Transport-context key carrying the request's Spring Security authentication to the tool handlers. */
    static final String AUTHENTICATION = "authentication";

    static final String INSTRUCTIONS = """
            Manage feature flags: the same reads and changes as the admin dashboard, as the role this API key was \
            given (admin, editor or viewer). Call whoami to see exactly what you may change.
            Model: each flag is ON/OFF per environment (dev, prod). When ON, its rules are checked in order and the \
            first match decides; if none matches, the 'otherwise' value is served. Rules target user IDs, customer \
            IDs, a deterministic percentage of users, or a context attribute the app sends (e.g. country) being in \
            or not in a list of values.
            Changes need the environment's current version (from get_flag); if someone else changed it first you \
            get a conflict: re-read and retry. Every change is recorded in the audit log under this key's name.""";

    @Bean
    McpJsonMapper mcpJsonMapper(ObjectMapper objectMapper) {
        return new JacksonMcpJsonMapper(objectMapper.copy());
    }

    @Bean
    HttpServletStatelessServerTransport mcpTransport(McpJsonMapper mcpJsonMapper) {
        return HttpServletStatelessServerTransport.builder()
                .jsonMapper(mcpJsonMapper)
                .messageEndpoint("/mcp")
                // Runs inside the security filter chain, where the API key has already been authenticated.
                .contextExtractor(request -> {
                    Map<String, Object> values = new HashMap<>();
                    values.put(AUTHENTICATION, SecurityContextHolder.getContext().getAuthentication());
                    return McpTransportContext.create(values);
                })
                .build();
    }

    @Bean
    ServletRegistrationBean<HttpServletStatelessServerTransport> mcpServlet(HttpServletStatelessServerTransport transport) {
        var registration = new ServletRegistrationBean<>(transport, "/mcp");
        registration.setName("mcp");
        registration.setAsyncSupported(true);
        return registration;
    }

    @Bean(destroyMethod = "close")
    McpStatelessSyncServer mcpServer(HttpServletStatelessServerTransport transport, McpJsonMapper mcpJsonMapper, AdminTools tools) {
        return McpServer.sync(transport)
                .serverInfo("feature-flags", "1.0.0")
                .instructions(INSTRUCTIONS)
                .capabilities(McpSchema.ServerCapabilities.builder().tools(false).build())
                // The schemas are advertised so agents know the shapes, but arguments are validated by the tools
                // themselves, with the dashboard's rules and messages (e.g. "rules[0].userIds[1]: must start with...").
                // The SDK's schema validator reports every failing oneOf branch, which misleads agents.
                .validateToolInputs(false)
                .tools(tools.specifications(mcpJsonMapper))
                .build();
    }
}
