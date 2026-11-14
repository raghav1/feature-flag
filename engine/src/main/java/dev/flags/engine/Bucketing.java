package dev.flags.engine;

import java.nio.charset.StandardCharsets;

/**
 * Deterministic rollout buckets. FROZEN: changing the hash, the input format or {@link #BUCKETS} moves every
 * user to a different bucket, so live rollouts would re-shuffle. BucketingTest pins this with golden vectors.
 */
public final class Bucketing {

    public static final int BUCKETS = 10_000;

    private Bucketing() {}

    /** Bucket in [0, BUCKETS) for this user on this flag. Same inputs always give the same bucket. */
    public static int bucket(String flagKey, String userId) {
        byte[] input = (flagKey + ":" + userId).getBytes(StandardCharsets.UTF_8);
        return (int) (Integer.toUnsignedLong(Murmur3.hash32(input, 0)) % BUCKETS);
    }
}
