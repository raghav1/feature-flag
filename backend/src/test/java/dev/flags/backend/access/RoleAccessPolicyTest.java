package dev.flags.backend.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.flags.backend.auth.AppUser;
import dev.flags.backend.auth.Role;
import dev.flags.backend.error.ForbiddenException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Unit test of every cell in the role matrix (docs/plan.md, "Auth and roles"). */
class RoleAccessPolicyTest {

    private final AccessPolicy policy = new RoleAccessPolicy();

    private static AppUser user(Role role) {
        return new AppUser(role.name().toLowerCase(), role);
    }

    @ParameterizedTest(name = "{0} change {1} -> {2}")
    @CsvSource(textBlock = """
            ADMIN,  dev,  true
            EDITOR, dev,  true
            VIEWER, dev,  false
            ADMIN,  prod, true
            EDITOR, prod, false
            VIEWER, prod, false
            """)
    void environmentChanges(Role role, String env, boolean allowed) {
        assertThat(policy.allowsEnvironmentChange(user(role), env)).isEqualTo(allowed);
        if (allowed) {
            assertThatCode(() -> policy.requireEnvironmentChange(user(role), env)).doesNotThrowAnyException();
        } else {
            assertThatThrownBy(() -> policy.requireEnvironmentChange(user(role), env)).isInstanceOf(ForbiddenException.class);
        }
    }

    @ParameterizedTest(name = "{0} {1} -> {2}")
    @CsvSource(textBlock = """
            ADMIN,  CREATE_FLAG,      true
            EDITOR, CREATE_FLAG,      true
            VIEWER, CREATE_FLAG,      false
            ADMIN,  EDIT_DESCRIPTION, true
            EDITOR, EDIT_DESCRIPTION, true
            VIEWER, EDIT_DESCRIPTION, false
            ADMIN,  DELETE_FLAG,      true
            EDITOR, DELETE_FLAG,      false
            VIEWER, DELETE_FLAG,      false
            """)
    void flagActions(Role role, FlagAction action, boolean allowed) {
        assertThat(policy.allows(user(role), action)).isEqualTo(allowed);
        if (allowed) {
            assertThatCode(() -> policy.require(user(role), action)).doesNotThrowAnyException();
        } else {
            assertThatThrownBy(() -> policy.require(user(role), action)).isInstanceOf(ForbiddenException.class);
        }
    }

    @Test
    void editorIsOnlyAllowedDevExactly() {
        for (String env : new String[] {"prod", "PROD", "Dev", "dev ", "staging", ""}) {
            assertThat(policy.allowsEnvironmentChange(user(Role.EDITOR), env)).as("env '%s'", env).isFalse();
        }
    }

    @Test
    void nullEnvironmentIsAProgrammingErrorNotADenial() {
        // Nulls are normalised at the API boundary; reaching here with one is a bug, so fail loudly.
        assertThatNullPointerException().isThrownBy(() -> policy.allowsEnvironmentChange(user(Role.ADMIN), null));
        assertThatNullPointerException().isThrownBy(() -> policy.requireEnvironmentChange(user(Role.EDITOR), null));
    }

    @Test
    void denialSaysWhoTriedWhat() {
        assertThatThrownBy(() -> policy.requireEnvironmentChange(user(Role.EDITOR), "prod"))
                .hasMessage("editor (editor) may not change prod.");
        assertThatThrownBy(() -> policy.require(user(Role.VIEWER), FlagAction.DELETE_FLAG))
                .hasMessage("viewer (viewer) may not delete flags.");
    }
}
