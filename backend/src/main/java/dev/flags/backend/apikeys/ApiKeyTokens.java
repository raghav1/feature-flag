package dev.flags.backend.apikeys;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Token format: "ffk_" + 43 base64url characters (256 random bits). A recognisable prefix lets secret scanners
 * and people spot a leaked key. Storage is a plain SHA-256: the token is high-entropy and random, so a slow
 * password hash adds nothing, and an exact hash allows an indexed lookup.
 */
final class ApiKeyTokens {

    static final String SCHEME = "ffk_";
    private static final int DISPLAY_PREFIX_LENGTH = SCHEME.length() + 8;
    private static final SecureRandom RANDOM = new SecureRandom();

    private ApiKeyTokens() {}

    static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return SCHEME + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String displayPrefix(String token) {
        return token.substring(0, DISPLAY_PREFIX_LENGTH);
    }

    static boolean looksLikeToken(String token) {
        return token.startsWith(SCHEME) && token.length() == SCHEME.length() + 43;
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }
}
