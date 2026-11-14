package dev.flags.backend.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
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

    @ParameterizedTest(name = "{0} {1} {2} -> {3}")
    @CsvSource(nullValues = "-", textBlock = """
            ADMIN,  CHANGE_ENVIRONMENT, dev,  true
            EDITOR, CHANGE_ENVIRONMENT, dev,  true
            VIEWER, CHANGE_ENVIRONMENT, dev,  false
            ADMIN,  CHANGE_ENVIRONMENT, prod, true
            EDITOR, CHANGE_ENVIRONMENT, prod, false
            VIEWER, CHANGE_ENVIRONMENT, prod, false
            ADMIN,  CREATE_FLAG,        -,    true
            EDITOR, CREATE_FLAG,        -,    true
            VIEWER, CREATE_FLAG,        -,    false
            ADMIN,  EDIT_DESCRIPTION,   -,    true
            EDITOR, EDIT_DESCRIPTION,   -,    true
            VIEWER, EDIT_DESCRIPTION,   -,    false
            ADMIN,  DELETE_FLAG,        -,    true
            EDITOR, DELETE_FLAG,        -,    false
            VIEWER, DELETE_FLAG,        -,    false
            """)
    void roleMatrix(Role role, Action action, String env, boolean allowed) {
        AppUser user = new AppUser(role.name().toLowerCase(), role);

        assertThat(policy.allows(user, action, env)).isEqualTo(allowed);
        if (allowed) {
            assertThatCode(() -> policy.require(user, action, env)).doesNotThrowAnyException();
        } else {
            assertThatThrownBy(() -> policy.require(user, action, env)).isInstanceOf(ForbiddenException.class);
        }
    }

    @Test
    void editorIsOnlyAllowedDevExactly() {
        AppUser editor = new AppUser("editor", Role.EDITOR);

        for (String env : new String[] {"prod", "PROD", "Dev", "staging", "", null}) {
            assertThat(policy.allows(editor, Action.CHANGE_ENVIRONMENT, env)).as("env %s", env).isFalse();
        }
    }

    @Test
    void denialSaysWhoTriedWhat() {
        assertThatThrownBy(() -> policy.require(new AppUser("editor", Role.EDITOR), Action.CHANGE_ENVIRONMENT, "prod"))
                .hasMessage("editor (editor) may not change prod.");
        assertThatThrownBy(() -> policy.require(new AppUser("viewer", Role.VIEWER), Action.DELETE_FLAG, null))
                .hasMessage("viewer (viewer) may not delete flags.");
    }
}
