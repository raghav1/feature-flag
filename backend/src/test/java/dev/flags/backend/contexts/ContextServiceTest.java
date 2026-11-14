package dev.flags.backend.contexts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import dev.flags.engine.EvaluationContext;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class ContextServiceTest {

    /** Records what it was asked to save; can be told to fail like a broken database. */
    static final class FakeRepository implements ContextRepository {
        final List<Map<ContextKind, String>> recorded = new ArrayList<>();
        boolean failing;

        @Override
        public void recordSeen(Map<ContextKind, String> seen) {
            if (failing) {
                throw new DataAccessResourceFailureException("database down");
            }
            recorded.add(Map.copyOf(seen));
        }

        @Override
        public List<SeenContext> search(ContextKind kind, String query, int limit) {
            return List.of();
        }

        @Override
        public Set<String> findSeen(ContextKind kind, Collection<String> values) {
            return Set.of("u_102");
        }
    }

    private final FakeRepository repository = new FakeRepository();
    private final ContextService service = new ContextService(repository);

    @Test
    void recordsTheUserAndCustomer() {
        service.recordSeen(new EvaluationContext("u_102", Map.of("customer", "acme", "country", "NZ")));

        assertThat(repository.recorded).containsExactly(Map.of(ContextKind.USER, "u_102", ContextKind.CUSTOMER, "acme"));
    }

    @Test
    void skipsMalformedIds() {
        service.recordSeen(new EvaluationContext("has space", Map.of("customer", "ok-customer")));

        assertThat(repository.recorded).containsExactly(Map.of(ContextKind.CUSTOMER, "ok-customer"));
    }

    @Test
    void aDatabaseFailureNeverFailsTheCaller() {
        repository.failing = true;

        assertThatCode(() -> service.recordSeen(new EvaluationContext("u_102", Map.of()))).doesNotThrowAnyException();
    }

    @Test
    void unseenKeepsOrderAndDropsDuplicates() {
        assertThat(service.unseen(ContextKind.USER, List.of("b", "u_102", "a", "b"))).containsExactly("b", "a");
    }
}
