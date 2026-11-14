package dev.flags.backend.evaluation;

import dev.flags.backend.flags.Flag;
import dev.flags.backend.flags.FlagEnvironment;
import dev.flags.backend.flags.FlagRepository;
import dev.flags.engine.EvaluationContext;
import dev.flags.engine.EvaluationResult;
import dev.flags.engine.Evaluator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EvaluationService {

    private final FlagRepository flags;
    private final Evaluator evaluator;

    EvaluationService(FlagRepository flags, Evaluator evaluator) {
        this.flags = flags;
        this.evaluator = evaluator;
    }

    /**
     * @param flagKeys flags to evaluate; empty means every flag. Unknown keys come back as FLAG_NOT_FOUND.
     * @return results by flag key, in key order
     */
    @Transactional(readOnly = true)
    public Map<String, FlagEvaluation> evaluate(String envKey, EvaluationContext context, List<String> flagKeys) {
        Map<String, Flag> byKey = flags.findAll().stream()
                .collect(Collectors.toMap(Flag::key, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        List<String> keys = flagKeys.isEmpty() ? List.copyOf(byKey.keySet()) : flagKeys.stream().distinct().sorted().toList();

        Map<String, FlagEvaluation> results = new LinkedHashMap<>();
        for (String key : keys) {
            results.put(key, Optional.ofNullable(byKey.get(key))
                    .flatMap(flag -> flag.environment(envKey))
                    .map(environment -> evaluate(key, environment, context))
                    .orElseGet(FlagEvaluation::notFound));
        }
        return results;
    }

    private FlagEvaluation evaluate(String key, FlagEnvironment environment, EvaluationContext context) {
        EvaluationResult result = evaluator.evaluate(EngineMapper.toFlagConfig(key, environment), context);
        OptionalInt index = result.matchedRuleIndex();
        Optional<String> type = index.isPresent()
                ? Optional.of(environment.rules().get(index.getAsInt()).typeName())
                : Optional.empty();
        return new FlagEvaluation(result.value(), result.reason(), index, type);
    }
}
