package dev.flags.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import dev.flags.engine.rules.PercentRollout;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class BucketingTest {

    /**
     * GOLDEN VECTORS. DO NOT EDIT TO MAKE A TEST PASS.
     *
     * <p>These pin which bucket every user lands in. If this test fails, the hash, its input format or the
     * bucket count changed, and every rollout in production would silently re-shuffle. Values were derived
     * with an independent Python murmur3_x86_32 (seed 0) over {@code utf8(flagKey + ":" + userId)} mod 10 000.
     */
    @ParameterizedTest(name = "{0} / {1} -> {2}")
    @CsvSource(delimiter = '|', textBlock = """
            new-dashboard | u_102                                 | 4008
            new-dashboard | u_207                                 | 8057
            beta-reports  | u_102                                 | 1061
            dark-mode     | u_1                                   | 9260
            dark-mode     | u_42                                  | 6770
            dark-mode     | user-ü-ñ                              | 3397
            checkout-v2   | 5f3c9a2e-7d41-4c1b-9e0a-2b6f8d1c3a77  | 7527
            a             | b                                     | 2131
            """)
    void goldenBuckets(String flagKey, String userId, int expectedBucket) {
        assertThat(Bucketing.bucket(flagKey, userId)).isEqualTo(expectedBucket);
    }

    @Test
    void bucketCountIsTenThousand() {
        assertThat(Bucketing.BUCKETS).isEqualTo(10_000);
    }

    @Test
    void bucketsStayInRange() {
        IntStream.range(0, 100_000).forEach(i ->
                assertThat(Bucketing.bucket("range-check", "u_" + i)).isBetween(0, Bucketing.BUCKETS - 1));
    }

    @Test
    void sameFlagAndUserAlwaysGiveTheSameBucket() {
        for (int i = 0; i < 1_000; i++) {
            assertThat(Bucketing.bucket("new-dashboard", "u_" + i))
                    .isEqualTo(Bucketing.bucket("new-dashboard", "u_" + i));
        }
    }

    /** Raising a rollout only adds users: nobody inside 5% falls out at 10%. */
    @Test
    void rolloutIsMonotonic() {
        for (int i = 0; i < 10_000; i++) {
            var context = Contexts.user("u_" + i);
            boolean wasIn = false;
            for (int percent = 0; percent <= 100; percent++) {
                boolean isIn = new PercentRollout(percent).matches("dark-mode", context);
                assertThat(!wasIn || isIn).as("u_%d dropped out at %d%%", i, percent).isTrue();
                wasIn = isIn;
            }
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 10, 25, 50, 90})
    void distributionIsCloseToTarget(int percent) {
        int users = 100_000;
        var rule = new PercentRollout(percent);

        long inRollout = IntStream.range(0, users).filter(i -> rule.matches("beta-reports", Contexts.user("u_" + i))).count();

        assertThat(inRollout * 100.0 / users).isCloseTo(percent, within(1.0));
    }

    /** Being in one flag's 50% says nothing about another flag's 50%: overlap should be about 25%. */
    @Test
    void flagsBucketIndependently() {
        int users = 100_000;
        var half = new PercentRollout(50);

        long inBoth = IntStream.range(0, users)
                .mapToObj(i -> Contexts.user("u_" + i))
                .filter(c -> half.matches("new-dashboard", c) && half.matches("beta-reports", c))
                .count();

        assertThat(inBoth * 100.0 / users).isCloseTo(25.0, within(1.0));
    }
}
