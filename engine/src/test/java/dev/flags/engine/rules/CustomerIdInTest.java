package dev.flags.engine.rules;

import static dev.flags.engine.Contexts.anonymous;
import static dev.flags.engine.Contexts.user;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import dev.flags.engine.EvaluationContext;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CustomerIdInTest {

    private final CustomerIdIn rule = new CustomerIdIn(Set.of("acme"));

    @Test
    void readsTheCustomerAttribute() {
        assertThat(CustomerIdIn.ATTRIBUTE).isEqualTo("customer");
        assertThat(rule.matches("f", user("u_1", "customer", "acme"))).isTrue();
    }

    @Test
    void worksWithoutAUserId() {
        assertThat(rule.matches("f", new EvaluationContext(null, Map.of("customer", "acme")))).isTrue();
    }

    @Test
    void missesOtherCustomersAndMissingAttribute() {
        assertThat(rule.matches("f", user("u_1", "customer", "globex"))).isFalse();
        assertThat(rule.matches("f", user("u_1"))).isFalse();
        assertThat(rule.matches("f", anonymous())).isFalse();
    }

    @Test
    void ignoresTheSameValueUnderAnotherAttribute() {
        assertThat(rule.matches("f", user("u_1", "tenant", "acme"))).isFalse();
    }

    @Test
    void rejectsEmptyOrBlankIds() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CustomerIdIn(Set.of()));
        assertThatIllegalArgumentException().isThrownBy(() -> new CustomerIdIn(Set.of("")));
    }
}
