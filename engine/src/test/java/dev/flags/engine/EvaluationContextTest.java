package dev.flags.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EvaluationContextTest {

    @Test
    void nullAttributesBecomeAnEmptyMap() {
        var context = new EvaluationContext("u_1", null);

        assertThat(context.attributes()).isEmpty();
        assertThat(context.attribute("customer")).isNull();
    }

    @Test
    void absentAttributeIsNull() {
        var context = new EvaluationContext("u_1", Map.of("customer", "acme"));

        assertThat(context.attribute("customer")).isEqualTo("acme");
        assertThat(context.attribute("country")).isNull();
    }

    @Test
    void attributesAreCopiedAndImmutable() {
        var source = new HashMap<String, String>();
        source.put("customer", "acme");
        var context = new EvaluationContext("u_1", source);

        source.put("customer", "globex");

        assertThat(context.attribute("customer")).isEqualTo("acme");
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
    void userIdMayBeAbsent() {
        assertThat(new EvaluationContext(null, Map.of()).userId()).isNull();
    }
}
