package dev.flags.engine.rules;

import static dev.flags.engine.Contexts.anonymous;
import static dev.flags.engine.Contexts.user;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import dev.flags.engine.Bucketing;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PercentRolloutTest {

    @Test
    void zeroPercentMatchesNobody() {
        var rule = new PercentRollout(0);

        assertThat(IntStream.range(0, 10_000).anyMatch(i -> rule.matches("f", user("u_" + i)))).isFalse();
    }

    @Test
    void hundredPercentMatchesEveryoneWithAnId() {
        var rule = new PercentRollout(100);

        assertThat(IntStream.range(0, 10_000).allMatch(i -> rule.matches("f", user("u_" + i)))).isTrue();
    }

    @Test
    void userWithoutAnIdNeverMatchesEvenAtHundredPercent() {
        var rule = new PercentRollout(100);

        assertThat(rule.matches("f", anonymous())).isFalse();
        assertThat(rule.matches("f", user(""))).isFalse();
        assertThat(rule.matches("f", user("   "))).isFalse();
    }

    @Test
    void matchesExactlyWhenTheBucketIsBelowTheThreshold() {
        for (int i = 0; i < 2_000; i++) {
            String userId = "u_" + i;
            int bucket = Bucketing.bucket("dark-mode", userId);
            for (int percent : new int[] {1, 10, 33, 50, 99}) {
                assertThat(new PercentRollout(percent).matches("dark-mode", user(userId)))
                        .as("%s at %d%% (bucket %d)", userId, percent, bucket)
                        .isEqualTo(bucket < percent * 100);
            }
        }
    }

    @Test
    void servesOnByDefaultAndCanServeOff() {
        assertThat(new PercentRollout(10).serve()).isTrue();
        assertThat(new PercentRollout(10, false).serve()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 101, Integer.MIN_VALUE, Integer.MAX_VALUE})
    void rejectsPercentOutsideZeroToHundred(int percent) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new PercentRollout(percent))
                .withMessageContaining("percent");
    }
}
