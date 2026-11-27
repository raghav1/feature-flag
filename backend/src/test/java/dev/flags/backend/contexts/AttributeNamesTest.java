package dev.flags.backend.contexts;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AttributeNamesTest {

    @ParameterizedTest
    @ValueSource(strings = {"country", "plan", "app_version", "x", "a1"})
    void acceptsLowercaseNames(String name) {
        assertThat(AttributeNames.isValid(name)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Country", "1x", "_x", "app-version", "app version", " country", "ünï"})
    void rejectsOtherNames(String name) {
        assertThat(AttributeNames.isValid(name)).isFalse();
    }

    @Test
    void capsLengthAt64() {
        assertThat(AttributeNames.isValid("a".repeat(64))).isTrue();
        assertThat(AttributeNames.isValid("a".repeat(65))).isFalse();
    }
}
