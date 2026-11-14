package dev.flags.engine.rules;

import static dev.flags.engine.Contexts.anonymous;
import static dev.flags.engine.Contexts.user;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class UserIdInTest {

    private final UserIdIn rule = new UserIdIn(Set.of("u_102", "u_207"));

    @Test
    void matchesListedUsers() {
        assertThat(rule.matches("f", user("u_102"))).isTrue();
        assertThat(rule.matches("f", user("u_207"))).isTrue();
    }

    @Test
    void missesUnlistedAndAnonymousUsers() {
        assertThat(rule.matches("f", user("u_103"))).isFalse();
        assertThat(rule.matches("f", user(""))).isFalse();
        assertThat(rule.matches("f", anonymous())).isFalse();
    }

    @Test
    void comparesIdsExactly() {
        assertThat(rule.matches("f", user("U_102"))).isFalse();
        assertThat(rule.matches("f", user(" u_102"))).isFalse();
    }

    @Test
    void servesOnByDefaultAndCanServeOff() {
        assertThat(rule.serve()).isTrue();
        assertThat(new UserIdIn(Set.of("u_1"), false).serve()).isFalse();
    }

    @Test
    void rejectsEmptyOrBlankIds() {
        assertThatIllegalArgumentException().isThrownBy(() -> new UserIdIn(Set.of()));
        assertThatIllegalArgumentException().isThrownBy(() -> new UserIdIn(Set.of("u_1", " ")));
        assertThatNullPointerException().isThrownBy(() -> new UserIdIn(null));
    }

    @Test
    void copiesIds() {
        var ids = new HashSet<>(Set.of("u_1"));
        var copied = new UserIdIn(ids);

        ids.add("u_2");

        assertThat(copied.matches("f", user("u_2"))).isFalse();
    }
}
