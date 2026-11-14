package dev.flags.backend.contexts;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ContextIdsTest {

    @ParameterizedTest
    @ValueSource(strings = {"u_102", "acme", "5f3c9a2e-7d41-4c1b-9e0a-2b6f8d1c3a77", "ana@example.com", "org:acme", "A.b-c_d"})
    void acceptsRealisticIds(String id) {
        assertThat(ContextIds.isValid(id)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " u_102", "u 102", "acme!", "_leading", "-leading", "a/b", "ünï"})
    void rejectsTypos(String id) {
        assertThat(ContextIds.isValid(id)).isFalse();
    }

    @org.junit.jupiter.api.Test
    void capsLengthAt128() {
        assertThat(ContextIds.isValid("a".repeat(128))).isTrue();
        assertThat(ContextIds.isValid("a".repeat(129))).isFalse();
    }
}
