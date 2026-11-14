package dev.flags.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.flags.engine.rules.PercentRollout;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class FlagConfigTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  "})
    void rejectsMissingKey(String key) {
        assertThatThrownBy(() -> new FlagConfig(key, true, List.of(), false))
                .isInstanceOfAny(IllegalArgumentException.class, NullPointerException.class)
                .hasMessageContaining("key");
    }

    @Test
    void rejectsNullRulesList() {
        assertThatNullPointerException()
                .isThrownBy(() -> new FlagConfig("f", true, null, false))
                .withMessageContaining("rules");
    }

    @Test
    void rejectsNullRuleInList() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new FlagConfig("f", true, Arrays.asList(new PercentRollout(5), null), false))
                .withMessageContaining("rules");
    }

    @Test
    void copiesRulesSoLaterChangesToTheCallersListDoNotLeakIn() {
        var rules = new ArrayList<Rule>(List.of(new PercentRollout(5)));
        var flag = new FlagConfig("f", true, rules, false);

        rules.add(new PercentRollout(50));

        assertThat(flag.rules()).hasSize(1);
        assertThatThrownBy(() -> flag.rules().add(new PercentRollout(1)))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
