package dev.flags.backend.flags;

import dev.flags.backend.access.AccessPolicy;
import dev.flags.backend.access.FlagAction;
import dev.flags.backend.audit.AuditAction;
import dev.flags.backend.audit.AuditDiff;
import dev.flags.backend.audit.AuditEntry;
import dev.flags.backend.audit.AuditLog;
import dev.flags.backend.auth.AppUser;
import dev.flags.backend.auth.CurrentUser;
import dev.flags.backend.environments.Environment;
import dev.flags.backend.environments.EnvironmentService;
import dev.flags.backend.error.ConflictException;
import dev.flags.backend.error.NotFoundException;
import dev.flags.backend.flags.rules.RuleSpec;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.UnaryOperator;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Flag use cases. Every change checks {@link AccessPolicy} first and writes its audit entry in the same
 * transaction, so a denied or failed change leaves neither data nor history behind.
 */
@Service
public class FlagService {

    private final FlagRepository flags;
    private final EnvironmentService environments;
    private final AccessPolicy accessPolicy;
    private final CurrentUser currentUser;
    private final AuditLog auditLog;
    private final ApplicationEventPublisher events;

    FlagService(FlagRepository flags, EnvironmentService environments, AccessPolicy accessPolicy,
            CurrentUser currentUser, AuditLog auditLog, ApplicationEventPublisher events) {
        this.flags = flags;
        this.environments = environments;
        this.accessPolicy = accessPolicy;
        this.currentUser = currentUser;
        this.auditLog = auditLog;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<Flag> list() {
        return flags.findAll();
    }

    @Transactional(readOnly = true)
    public Flag get(String key) {
        return find(key);
    }

    @Transactional
    public Flag create(String key, String description) {
        AppUser user = currentUser.get();
        accessPolicy.require(user, FlagAction.CREATE_FLAG);
        if (flags.existsByKey(key)) {
            throw new ConflictException("A flag with key '" + key + "' already exists.");
        }
        Flag created = flags.insert(key, description);
        auditLog.record(AuditEntry.created(user.username(), key, FlagSnapshot.of(created)));
        events.publishEvent(new FlagChanged(key, allEnvironments()));
        return created;
    }

    @Transactional
    public Flag updateDescription(String key, String description) {
        AppUser user = currentUser.get();
        accessPolicy.require(user, FlagAction.EDIT_DESCRIPTION);
        Flag before = find(key);
        if (before.description().equals(description)) {
            return before;
        }
        flags.updateDescription(before.id(), description);
        Flag after = find(key);
        auditLog.record(AuditEntry.flagChanged(user.username(), key,
                AuditDiff.descriptionChanged(before.description(), description),
                FlagSnapshot.of(before), FlagSnapshot.of(after)));
        return after;
    }

    @Transactional
    public void delete(String key) {
        AppUser user = currentUser.get();
        accessPolicy.require(user, FlagAction.DELETE_FLAG);
        Flag flag = find(key);
        flags.delete(flag.id());
        auditLog.record(AuditEntry.deleted(user.username(), key, flag));
        events.publishEvent(new FlagChanged(key, allEnvironments()));
    }

    @Transactional
    public FlagEnvironment setEnabled(String key, String envKey, boolean enabled, int version) {
        return change(key, envKey, version, AuditAction.FLAG_TOGGLED,
                before -> new EnvironmentSnapshot(enabled, before.otherwise(), before.rules()),
                (before, after) -> AuditDiff.toggled(after.enabled()));
    }

    @Transactional
    public FlagEnvironment setRules(String key, String envKey, List<RuleSpec> rules, boolean otherwise, int version) {
        return change(key, envKey, version, AuditAction.RULES_UPDATED,
                before -> new EnvironmentSnapshot(before.enabled(), otherwise, rules),
                (before, after) -> AuditDiff.rulesChanged(before.rules(), before.otherwise(), after.rules(), after.otherwise()));
    }

    private FlagEnvironment change(String key, String envKey, int version, AuditAction action,
            UnaryOperator<EnvironmentSnapshot> edit, BiFunction<EnvironmentSnapshot, EnvironmentSnapshot, String> summary) {
        AppUser user = currentUser.get();
        environments.requireExists(envKey);
        accessPolicy.requireEnvironmentChange(user, envKey);

        Flag flag = find(key);
        FlagEnvironment current = flag.environment(envKey)
                .orElseThrow(() -> new IllegalStateException("flag " + key + " has no row for " + envKey));
        if (current.version() != version) {
            throw staleVersion(key, envKey, current.version(), version);
        }
        EnvironmentSnapshot before = current.snapshot();
        EnvironmentSnapshot after = edit.apply(before);
        if (after.equals(before)) {
            return current; // nothing changed: no version bump, no audit noise
        }
        if (!flags.updateEnvironment(flag.id(), envKey, after, version)) {
            throw staleVersion(key, envKey, -1, version); // lost a race with a concurrent edit
        }
        auditLog.record(AuditEntry.environmentChanged(
                user.username(), key, envKey, action, summary.apply(before, after), before, after));
        events.publishEvent(new FlagChanged(key, List.of(envKey)));
        return find(key).environment(envKey).orElseThrow();
    }

    // Description edits don't publish: they can't change an evaluation result.
    private List<String> allEnvironments() {
        return environments.list().stream().map(Environment::key).toList();
    }

    private Flag find(String key) {
        return flags.findByKey(key).orElseThrow(() -> new NotFoundException("No flag '" + key + "'."));
    }

    private static ConflictException staleVersion(String key, String envKey, int current, int sent) {
        String now = current >= 0 ? " (now version " + current + ")" : "";
        return new ConflictException("'%s' in %s changed since you loaded version %d%s. Reload and try again."
                .formatted(key, envKey, sent, now));
    }
}
