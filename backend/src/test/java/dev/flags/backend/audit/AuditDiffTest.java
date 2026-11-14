package dev.flags.backend.audit;

import static org.assertj.core.api.Assertions.assertThat;

import dev.flags.backend.flags.rules.CustomersRule;
import dev.flags.backend.flags.rules.PercentRule;
import dev.flags.backend.flags.rules.RuleSpec;
import dev.flags.backend.flags.rules.UsersRule;
import java.util.List;
import org.junit.jupiter.api.Test;

class AuditDiffTest {

    private static final RuleSpec USERS = new UsersRule(List.of("u_102", "u_207"), null);
    private static final RuleSpec ACME = new CustomersRule(List.of("acme"), null);

    private static RuleSpec percent(int p) {
        return new PercentRule(p, null);
    }

    @Test
    void toggle() {
        assertThat(AuditDiff.toggled(true)).isEqualTo("turned ON");
        assertThat(AuditDiff.toggled(false)).isEqualTo("turned OFF");
    }

    @Test
    void rolloutChange() {
        assertThat(AuditDiff.rulesChanged(List.of(USERS, percent(5)), false, List.of(USERS, percent(10)), false))
                .isEqualTo("rollout 5% → 10%");
    }

    @Test
    void addedAndRemovedRules() {
        assertThat(AuditDiff.rulesChanged(List.of(), false, List.of(USERS), false))
                .isEqualTo("added rule: users u_102, u_207");
        assertThat(AuditDiff.rulesChanged(List.of(USERS, ACME), false, List.of(ACME), false))
                .isEqualTo("removed rule: users u_102, u_207");
    }

    @Test
    void reorder() {
        assertThat(AuditDiff.rulesChanged(List.of(USERS, ACME), false, List.of(ACME, USERS), false))
                .isEqualTo("rules reordered");
    }

    @Test
    void ruleEditedInPlace() {
        assertThat(AuditDiff.rulesChanged(List.of(USERS), false, List.of(new UsersRule(List.of("u_102"), null)), false))
                .isEqualTo("rule 1: users u_102, u_207 → users u_102");
    }

    @Test
    void ruleSwitchedToServeOff() {
        assertThat(AuditDiff.rulesChanged(List.of(ACME), false, List.of(new CustomersRule(List.of("acme"), false)), false))
                .isEqualTo("rule 1: customers acme → customers acme (serves OFF)");
    }

    @Test
    void otherwiseChangeIsReportedAlongsideRuleChanges() {
        assertThat(AuditDiff.rulesChanged(List.of(percent(5)), false, List.of(percent(25)), true))
                .isEqualTo("rollout 5% → 25%; otherwise OFF → ON");
    }

    @Test
    void noChanges() {
        assertThat(AuditDiff.rulesChanged(List.of(USERS), true, List.of(USERS), true)).isEqualTo("no changes");
    }

    @Test
    void description() {
        assertThat(AuditDiff.descriptionChanged("old", "new")).isEqualTo("description \"old\" → \"new\"");
    }
}
