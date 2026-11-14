package dev.flags.backend.audit;

import dev.flags.backend.flags.rules.PercentRule;
import dev.flags.backend.flags.rules.RuleSpec;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Turns before/after state into the plain-words summary shown in the audit log. Pure functions. */
public final class AuditDiff {

    private AuditDiff() {}

    public static String toggled(boolean enabled) {
        return "turned " + onOff(enabled);
    }

    public static String descriptionChanged(String before, String after) {
        return "description \"%s\" → \"%s\"".formatted(before, after);
    }

    /** e.g. "rollout 5% → 10%", "added rule: users u_102", "rules reordered; otherwise OFF → ON". */
    public static String rulesChanged(List<RuleSpec> before, boolean otherwiseBefore, List<RuleSpec> after, boolean otherwiseAfter) {
        List<String> changes = new ArrayList<>();

        if (!before.equals(after)) {
            if (before.size() == after.size() && sameElements(before, after)) {
                changes.add("rules reordered");
            } else if (before.size() == after.size()) {
                for (int i = 0; i < before.size(); i++) {
                    if (!before.get(i).equals(after.get(i))) {
                        changes.add(ruleEdited(i, before.get(i), after.get(i)));
                    }
                }
            } else {
                minus(before, after).forEach(r -> changes.add("removed rule: " + r.describe()));
                minus(after, before).forEach(r -> changes.add("added rule: " + r.describe()));
            }
        }
        if (otherwiseBefore != otherwiseAfter) {
            changes.add("otherwise %s → %s".formatted(onOff(otherwiseBefore), onOff(otherwiseAfter)));
        }
        return changes.isEmpty() ? "no changes" : String.join("; ", changes);
    }

    private static String ruleEdited(int index, RuleSpec before, RuleSpec after) {
        if (before instanceof PercentRule b && after instanceof PercentRule a && Objects.equals(b.serve(), a.serve())) {
            return "rollout %d%% → %d%%".formatted(b.percent(), a.percent());
        }
        return "rule %d: %s → %s".formatted(index + 1, before.describe(), after.describe());
    }

    private static boolean sameElements(List<RuleSpec> a, List<RuleSpec> b) {
        return minus(a, b).isEmpty() && minus(b, a).isEmpty();
    }

    /** Multiset difference: each element of {@code b} cancels one equal element of {@code a}. */
    private static List<RuleSpec> minus(List<RuleSpec> a, List<RuleSpec> b) {
        List<RuleSpec> remaining = new ArrayList<>(a);
        b.forEach(remaining::remove);
        return remaining;
    }

    private static String onOff(boolean value) {
        return value ? "ON" : "OFF";
    }
}
