package dev.flags.backend.apikeys;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import org.junit.jupiter.api.Test;

class ApiKeyTokensTest {

    @Test
    void tokensHaveAScannableSchemeAndAreRandom() {
        var seen = new HashSet<String>();
        for (int i = 0; i < 1000; i++) {
            String token = ApiKeyTokens.newToken();
            assertThat(token).matches("^ffk_[A-Za-z0-9_-]{43}$");
            assertThat(ApiKeyTokens.looksLikeToken(token)).isTrue();
            assertThat(seen.add(token)).isTrue();
        }
    }

    @Test
    void prefixIsShortEnoughToBeHarmlessAndLongEnoughToRecognise() {
        String token = ApiKeyTokens.newToken();

        assertThat(ApiKeyTokens.displayPrefix(token)).hasSize(12).isEqualTo(token.substring(0, 12));
    }

    @Test
    void hashIsStableSha256Hex() {
        assertThat(ApiKeyTokens.hash("ffk_test")).isEqualTo(ApiKeyTokens.hash("ffk_test")).hasSize(64).matches("[0-9a-f]+");
        assertThat(ApiKeyTokens.hash("ffk_test")).isNotEqualTo(ApiKeyTokens.hash("ffk_tesT"));
    }

    @Test
    void rejectsThingsThatAreNotTokens() {
        assertThat(ApiKeyTokens.looksLikeToken("")).isFalse();
        assertThat(ApiKeyTokens.looksLikeToken("ffk_short")).isFalse();
        assertThat(ApiKeyTokens.looksLikeToken("abc_" + "a".repeat(43))).isFalse();
    }
}
