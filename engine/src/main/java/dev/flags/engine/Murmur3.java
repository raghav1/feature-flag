package dev.flags.engine;

/** MurmurHash3 x86 32-bit (Austin Appleby, public domain). Verified against published vectors in Murmur3Test. */
final class Murmur3 {

    private static final int C1 = 0xcc9e2d51;
    private static final int C2 = 0x1b873593;

    private Murmur3() {}

    static int hash32(byte[] data, int seed) {
        int h = seed;
        int length = data.length;
        int blockEnd = length & ~3;

        for (int i = 0; i < blockEnd; i += 4) {
            int k = (data[i] & 0xff)
                    | (data[i + 1] & 0xff) << 8
                    | (data[i + 2] & 0xff) << 16
                    | (data[i + 3] & 0xff) << 24;
            h ^= mixK(k);
            h = Integer.rotateLeft(h, 13);
            h = h * 5 + 0xe6546b64;
        }

        // Remaining 1–3 bytes, little-endian.
        int tail = length - blockEnd;
        if (tail > 0) {
            int k = 0;
            for (int j = tail - 1; j >= 0; j--) {
                k = (k << 8) | (data[blockEnd + j] & 0xff);
            }
            h ^= mixK(k);
        }

        h ^= length;
        h ^= h >>> 16;
        h *= 0x85ebca6b;
        h ^= h >>> 13;
        h *= 0xc2b2ae35;
        h ^= h >>> 16;
        return h;
    }

    private static int mixK(int k) {
        k *= C1;
        k = Integer.rotateLeft(k, 15);
        return k * C2;
    }
}
