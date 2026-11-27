package dev.flags.backend.mcp;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.InvalidTypeIdException;
import dev.flags.backend.access.PermissionsService;
import dev.flags.backend.audit.AuditLog;
import dev.flags.backend.audit.AuditQuery;
import dev.flags.backend.auth.AppUser;
import dev.flags.backend.auth.CurrentUser;
import dev.flags.backend.contexts.AttributeNames;
import dev.flags.backend.contexts.ContextIds;
import dev.flags.backend.contexts.ContextKind;
import dev.flags.backend.contexts.ContextService;
import dev.flags.backend.environments.EnvironmentService;
import dev.flags.backend.error.ConflictException;
import dev.flags.backend.error.ForbiddenException;
import dev.flags.backend.error.NotFoundException;
import dev.flags.backend.flags.FlagKeys;
import dev.flags.backend.flags.FlagService;
import dev.flags.backend.flags.FlagView;
import dev.flags.backend.flags.rules.RuleSpec;
import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.server.McpStatelessServerFeatures.SyncToolSpecification;
import io.modelcontextprotocol.spec.McpSchema;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;
import io.modelcontextprotocol.spec.McpSchema.ToolAnnotations;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Everything the admin dashboard can read or change, as MCP tools. Each call runs as the API key's identity
 * through the same services as the dashboard, so permissions, validation, optimistic locking and the audit log
 * apply unchanged. Results use the same JSON shapes as the REST API.
 */
@Component
class AdminTools {

    private static final Logger log = LoggerFactory.getLogger(AdminTools.class);

    /** Same rule validation as PUT /api/flags/{key}/envs/{env}/rules, so field paths match (rules[0].userIds[1]). */
    record RulesInput(@NotNull @Size(max = 50) List<@NotNull @Valid RuleSpec> rules) {}

    private record Tool(String name, String title, String description, String inputSchema, ToolAnnotations annotations,
            Function<ToolArgs, Object> handler) {}

    private static final ToolAnnotations READ = ToolAnnotations.builder().readOnlyHint(true).openWorldHint(false).build();
    private static final ToolAnnotations WRITE =
            ToolAnnotations.builder().readOnlyHint(false).destructiveHint(false).idempotentHint(false).openWorldHint(false).build();
    private static final ToolAnnotations IDEMPOTENT_WRITE =
            ToolAnnotations.builder().readOnlyHint(false).destructiveHint(false).idempotentHint(true).openWorldHint(false).build();
    private static final ToolAnnotations DESTRUCTIVE =
            ToolAnnotations.builder().readOnlyHint(false).destructiveHint(true).idempotentHint(true).openWorldHint(false).build();

    private static final String NO_ARGS = """
            {"type": "object", "properties": {}, "additionalProperties": false}""";
    private static final String FLAG_KEY = """
            {"type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,62}$", "description": "Flag key, e.g. new-dashboard"}""";
    private static final String ENVIRONMENT = """
            {"type": "string", "description": "Environment key, e.g. dev or prod (see list_environments)"}""";
    private static final String VERSION = """
            {"type": "integer", "minimum": 0, "description": "The environment's current version from get_flag. A stale version is rejected so you never overwrite a change you haven't seen."}""";
    // Patterns come from the same constants the REST validation uses (AD-14); neither contains a JSON-escaped character.
    private static final String ID = "{\"type\": \"string\", \"pattern\": \"%s\"}".formatted(ContextIds.PATTERN);
    private static final String ATTRIBUTE_NAME = "{\"type\": \"string\", \"pattern\": \"%s\", \"description\": \"Context attribute, e.g. country or plan\"}"
            .formatted(AttributeNames.PATTERN);

    private final FlagService flags;
    private final EnvironmentService environments;
    private final AuditLog auditLog;
    private final ContextService contexts;
    private final PermissionsService permissions;
    private final CurrentUser currentUser;
    private final ObjectMapper json;
    private final Validator validator;

    AdminTools(FlagService flags, EnvironmentService environments, AuditLog auditLog, ContextService contexts,
            PermissionsService permissions, CurrentUser currentUser, ObjectMapper json, Validator validator) {
        this.flags = flags;
        this.environments = environments;
        this.auditLog = auditLog;
        this.contexts = contexts;
        this.permissions = permissions;
        this.currentUser = currentUser;
        this.json = json;
        this.validator = validator;
    }

    List<SyncToolSpecification> specifications(McpJsonMapper mapper) {
        return tools().stream()
                .map(t -> new SyncToolSpecification(
                        McpSchema.Tool.builder()
                                .name(t.name())
                                .title(t.title())
                                .description(t.description())
                                .inputSchema(mapper, t.inputSchema())
                                .annotations(t.annotations())
                                .build(),
                        (context, request) -> call(context, new ToolArgs(request.arguments()), t.handler())))
                .toList();
    }

    private List<Tool> tools() {
        return List.of(
                new Tool("whoami", "Who am I",
                        "The identity this API key acts as, its role, and exactly what it may change (createFlag, editDescription, "
                                + "deleteFlag, changeEnvironments). Call this first to know which other tools will succeed.",
                        NO_ARGS, READ,
                        args -> {
                            AppUser user = currentUser.get();
                            return Map.of("name", user.username(), "role", user.role(), "can", permissions.of(user));
                        }),

                new Tool("list_environments", "List environments", "The environments flags can be configured in, in display order.",
                        NO_ARGS, READ,
                        args -> Map.of("environments", environments.list())),

                new Tool("list_flags", "List flags",
                        "Every flag with its description and, per environment: enabled, the ordered rules (first match wins), "
                                + "the 'otherwise' value served when no rule matches, and the version needed to change it.",
                        NO_ARGS, READ,
                        args -> Map.of("flags", flags.list().stream().map(FlagView::of).toList())),

                new Tool("get_flag", "Get a flag", "One flag, with its full configuration and current version in every environment.",
                        """
                        {"type": "object", "properties": {"key": %s}, "required": ["key"], "additionalProperties": false}"""
                                .formatted(FLAG_KEY),
                        READ,
                        args -> FlagView.of(flags.get(args.string("key")))),

                new Tool("get_audit_log", "Search the audit log",
                        "Who changed what and when across all flags, newest first, in plain words (e.g. 'rollout 5% → 10%'). "
                                + "Filter by flag, environment, action, actor type, or text in the summary/flag/actor. Page back "
                                + "by passing the smallest event id you have as 'before'. Changes made with an API key show the "
                                + "actor as 'key:<name>'.",
                        """
                        {"type": "object", "properties": {
                          "flag": {"type": "string", "description": "Only this flag"},
                          "environment": {"type": "string", "description": "Only this environment"},
                          "query": {"type": "string", "maxLength": 200, "description": "Text to find in the summary, flag key or actor"},
                          "action": {"type": "string", "enum": ["FLAG_CREATED", "FLAG_UPDATED", "FLAG_DELETED", "FLAG_TOGGLED", "RULES_UPDATED"]},
                          "actor": {"type": "string", "enum": ["person", "key"], "description": "Changes by people, or by API keys (agents)"},
                          "before": {"type": "integer", "minimum": 1, "description": "Only events older than this event id (paging)"},
                          "limit": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50}
                        }, "additionalProperties": false}""",
                        READ,
                        args -> {
                            int limit = args.optionalInteger("limit").orElse(50);
                            if (limit < 1 || limit > 200) {
                                throw new ToolInputException("'limit' must be between 1 and 200.");
                            }
                            String query = args.optionalString("query").orElse("");
                            if (query.length() > 200) {
                                throw new ToolInputException("'query' may be at most 200 characters.");
                            }
                            return Map.of("events", auditLog.search(new AuditQuery(
                                    args.optionalString("flag"),
                                    args.optionalString("environment"),
                                    args.optionalString("query").map(String::strip),
                                    args.optionalString("action").map(AuditQuery::parseAction),
                                    args.optionalString("actor").map(AuditQuery.ActorType::parse),
                                    args.optionalInteger("before").map(Integer::longValue),
                                    limit)));
                        }),

                new Tool("suggest_ids", "Suggest user or customer IDs",
                        "User or customer IDs the flag service has actually evaluated, most recently seen first, optionally "
                                + "filtered by a substring. Use this to find real IDs before targeting them in a rule.",
                        """
                        {"type": "object", "properties": {
                          "kind": {"type": "string", "enum": ["user", "customer"]},
                          "query": {"type": "string", "maxLength": 128, "description": "Substring to match, case-insensitive"},
                          "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 20}
                        }, "required": ["kind"], "additionalProperties": false}""",
                        READ,
                        args -> {
                            int limit = args.optionalInteger("limit").orElse(20);
                            if (limit < 1 || limit > 100) {
                                throw new ToolInputException("'limit' must be between 1 and 100.");
                            }
                            String query = args.optionalString("query").orElse("");
                            if (query.length() > 128) {
                                throw new ToolInputException("'query' may be at most 128 characters.");
                            }
                            return Map.of("suggestions", contexts.suggest(kind(args), query, limit));
                        }),

                new Tool("find_unseen_ids", "Find IDs never seen",
                        "Which of the given user or customer IDs the flag service has never evaluated. Unseen IDs are still "
                                + "allowed in rules (you may target someone before their first visit), but are often typos.",
                        """
                        {"type": "object", "properties": {
                          "kind": {"type": "string", "enum": ["user", "customer"]},
                          "ids": {"type": "array", "items": {"type": "string"}, "maxItems": 1000}
                        }, "required": ["kind", "ids"], "additionalProperties": false}""",
                        READ,
                        args -> {
                            List<String> ids = args.strings("ids");
                            if (ids.size() > 1000) {
                                throw new ToolInputException("'ids' may hold at most 1000 values.");
                            }
                            return Map.of("unseen", contexts.unseen(kind(args), ids));
                        }),

                new Tool("create_flag", "Create a flag",
                        "Creates a boolean flag, OFF in every environment with no rules. The key can't be changed later.",
                        """
                        {"type": "object", "properties": {
                          "key": %s,
                          "description": {"type": "string", "maxLength": 500}
                        }, "required": ["key"], "additionalProperties": false}""".formatted(FLAG_KEY),
                        WRITE,
                        args -> {
                            String key = args.string("key");
                            if (!key.matches(FlagKeys.PATTERN)) {
                                throw new ToolInputException("'key' " + FlagKeys.MESSAGE + ".");
                            }
                            return FlagView.of(flags.create(key, description(args.optionalString("description").orElse(""))));
                        }),

                new Tool("update_flag_description", "Edit a flag's description", "Changes the description. The key can't be changed.",
                        """
                        {"type": "object", "properties": {
                          "key": %s,
                          "description": {"type": "string", "maxLength": 500}
                        }, "required": ["key", "description"], "additionalProperties": false}""".formatted(FLAG_KEY),
                        IDEMPOTENT_WRITE,
                        args -> FlagView.of(flags.updateDescription(args.string("key"), description(args.optionalString("description").orElse(""))))),

                new Tool("delete_flag", "Delete a flag",
                        "Permanently deletes the flag in EVERY environment; code that checks it gets OFF. The audit history is "
                                + "kept. To guard against mistakes, 'confirm_key' must repeat the flag key exactly.",
                        """
                        {"type": "object", "properties": {
                          "key": %s,
                          "confirm_key": {"type": "string", "description": "Must equal 'key'"}
                        }, "required": ["key", "confirm_key"], "additionalProperties": false}""".formatted(FLAG_KEY),
                        DESTRUCTIVE,
                        args -> {
                            String key = args.string("key");
                            if (!key.equals(args.string("confirm_key"))) {
                                throw new ToolInputException("'confirm_key' must equal 'key' to delete a flag.");
                            }
                            flags.delete(key);
                            return Map.of("deleted", key);
                        }),

                new Tool("set_flag_enabled", "Turn a flag on or off in an environment",
                        "Turns the flag ON or OFF in one environment. OFF means everyone gets OFF regardless of rules; ON "
                                + "means the rules apply. Read get_flag first and pass that environment's version.",
                        """
                        {"type": "object", "properties": {
                          "key": %s, "environment": %s,
                          "enabled": {"type": "boolean"},
                          "version": %s
                        }, "required": ["key", "environment", "enabled", "version"], "additionalProperties": false}"""
                                .formatted(FLAG_KEY, ENVIRONMENT, VERSION),
                        IDEMPOTENT_WRITE,
                        args -> FlagView.EnvironmentView.of(flags.setEnabled(
                                args.string("key"), args.string("environment"), args.bool("enabled"), args.integer("version")))),

                new Tool("set_flag_rules", "Replace a flag's rules in an environment",
                        "Replaces the whole ordered rule list and the 'otherwise' value in one environment. Rules are checked "
                                + "top to bottom; the first match decides (its 'serve' value, default true). No match → "
                                + "'otherwise'. To add or remove one rule, read get_flag, edit the list and send all of it back "
                                + "with that environment's version.",
                        """
                        {"type": "object", "properties": {
                          "key": %s, "environment": %s,
                          "rules": {"type": "array", "maxItems": 50, "items": {"oneOf": [
                            {"type": "object", "properties": {"type": {"const": "users"}, "userIds": {"type": "array", "items": %s, "minItems": 1, "maxItems": 1000}, "serve": {"type": "boolean"}}, "required": ["type", "userIds"]},
                            {"type": "object", "properties": {"type": {"const": "customers"}, "customerIds": {"type": "array", "items": %s, "minItems": 1, "maxItems": 1000}, "serve": {"type": "boolean"}}, "required": ["type", "customerIds"]},
                            {"type": "object", "properties": {"type": {"const": "percent"}, "percent": {"type": "integer", "minimum": 0, "maximum": 100}, "serve": {"type": "boolean"}}, "required": ["type", "percent"], "description": "Deterministic per user: the same user always gets the same answer, and raising the percent only adds users."},
                            {"type": "object", "properties": {"type": {"const": "attribute"}, "attribute": %s, "operator": {"enum": ["in", "not_in"]}, "values": {"type": "array", "items": %s, "minItems": 1, "maxItems": 1000}, "serve": {"type": "boolean"}}, "required": ["type", "attribute", "operator", "values"], "description": "Matches when the context attribute (sent by the SDK, e.g. country) is in, or not in, the values. Exact and case-sensitive; a user without the attribute never matches either operator. Use the attribute names and values your app's SDK sends; nothing checks that a name has been seen."}
                          ]}},
                          "otherwise": {"type": "boolean", "description": "Served when the flag is ON and no rule matches"},
                          "version": %s
                        }, "required": ["key", "environment", "rules", "otherwise", "version"], "additionalProperties": false}"""
                                .formatted(FLAG_KEY, ENVIRONMENT, ID, ID, ATTRIBUTE_NAME, ID, VERSION),
                        DESTRUCTIVE,
                        args -> FlagView.EnvironmentView.of(flags.setRules(
                                args.string("key"), args.string("environment"), rules(args.raw("rules")), args.bool("otherwise"),
                                args.integer("version")))));
    }

    /** Runs a tool as the key's identity and turns the outcome into an MCP result. */
    private CallToolResult call(McpTransportContext context, ToolArgs args, Function<ToolArgs, Object> handler) {
        if (!(context.get(McpConfig.AUTHENTICATION) instanceof Authentication authentication)) {
            return error("Not authenticated.");
        }
        var securityContext = SecurityContextHolder.createEmptyContext();
        securityContext.setAuthentication(authentication);
        SecurityContextHolder.setContext(securityContext);
        try {
            Object result = json.convertValue(handler.apply(args), Object.class);
            return CallToolResult.builder()
                    .structuredContent(result)
                    .addTextContent(json.writeValueAsString(result))
                    .isError(false)
                    .build();
        } catch (ForbiddenException | NotFoundException | ConflictException | ToolInputException | IllegalArgumentException e) {
            return error(e.getMessage());
        } catch (Exception e) {
            log.error("MCP tool failed", e);
            return error("Internal error; see the server log.");
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private static CallToolResult error(String message) {
        return CallToolResult.builder().addTextContent(message).isError(true).build();
    }

    private static ContextKind kind(ToolArgs args) {
        return ContextKind.parse(args.string("kind"));
    }

    private static String description(String description) {
        if (description.length() > 500) {
            throw new ToolInputException("'description' may be at most 500 characters.");
        }
        return description;
    }

    private List<RuleSpec> rules(Object raw) {
        List<RuleSpec> rules;
        try {
            rules = json.convertValue(raw, new TypeReference<List<RuleSpec>>() {});
        } catch (IllegalArgumentException e) {
            if (e.getCause() instanceof InvalidTypeIdException t) {
                throw new ToolInputException("Unknown rule type '" + t.getTypeId() + "'. Use " + RuleSpec.typeChoices() + ".");
            }
            throw new ToolInputException("'rules' must be a list of rule objects: " + e.getMessage());
        }
        var violations = validator.validate(new RulesInput(rules));
        if (!violations.isEmpty()) {
            List<String> problems = new ArrayList<>();
            violations.stream()
                    .sorted(Comparator.comparing(v -> v.getPropertyPath().toString()))
                    // "rules[0].userIds[1].<list element>" → "rules[0].userIds[1]", as the REST API reports it.
                    .forEach(v -> problems.add(v.getPropertyPath().toString().replaceAll("\\.<[^>]+>", "") + ": " + v.getMessage()));
            throw new ToolInputException("Invalid rules. " + String.join("; ", problems));
        }
        return rules;
    }
}
