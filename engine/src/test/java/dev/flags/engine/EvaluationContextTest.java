package dev.flags.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class EvaluationContextTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void missingOrBlankUserIdIsAnonymous(String userId) {
        var context = new EvaluationContext(userId, Map.of());

        assertThat(context.userId()).isEmpty();
        assertThat(context).isEqualTo(EvaluationContext.anonymous());
    }

    @Test
    void userIdIsKeptExactly() {
        assertThat(new EvaluationContext(" u_1", null).userId()).contains(" u_1");
    }

    @Test
    void nullAttributesBecomeAnEmptyMap() {
        var context = new EvaluationContext("u_1", null);

        assertThat(context.attributes()).isEmpty();
        assertThat(context.attribute("customer")).isEmpty();
    }

    @Test
    void absentAttributeIsEmptyNotNull() {
        var context = new EvaluationContext("u_1", Map.of("customer", "acme"));

        assertThat(context.attribute("customer")).contains("acme");
        assertThat(context.attribute("country")).isEmpty();
    }

    @Test
    void attributesAreCopiedAndImmutable() {
        var source = new HashMap<String, String>();
        source.put("customer", "acme");
        var context = new EvaluationContext("u_1", source);

        source.put("customer", "globex");

        assertThat(context.attribute("customer")).contains("acme");
        assertThatThrownBy(() -> context.attributes().put("country", "NZ"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void rejectsNullAttributeValues() {
        var source = new HashMap<String, String>();
        source.put("customer", null);

        assertThatIllegalArgumentException()
                .isThrownBy(() -> new EvaluationContext("u_1", source))
                .withMessageContaining("customer");
    }

    @Test
    void rejectsNullAttributeNames() {
        var source = new HashMap<String, String>();
        source.put(null, "acme");

        assertThatIllegalArgumentException().isThrownBy(() -> new EvaluationContext("u_1", source));
    }

    @Test
    void equalByValue() {
        assertThat(new EvaluationContext("u_1", Map.of("a", "b")))
                .isEqualTo(new EvaluationContext("u_1", Map.of("a", "b")))
                .hasSameHashCodeAs(new EvaluationContext("u_1", Map.of("a", "b")))
                .isNotEqualTo(new EvaluationContext("u_2", Map.of("a", "b")));
    }
}
