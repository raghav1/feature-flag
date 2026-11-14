package dev.flags.backend.mcp;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Typed access to a tool call's arguments, with the same "absent means empty" normalisation as the REST boundary.
 * Wrong or missing arguments throw {@link ToolInputException}, which the agent sees as a tool error.
 */
final class ToolArgs {

    private final Map<String, Object> values;

    ToolArgs(Map<String, Object> values) {
        this.values = values == null ? Map.of() : values;
    }

    String string(String name) {
        return optionalString(name).orElseThrow(() -> new ToolInputException("'" + name + "' is required."));
    }

    Optional<String> optionalString(String name) {
        Object value = values.get(name);
        if (value == null) {
            return Optional.empty();
        }
        if (!(value instanceof String text)) {
            throw new ToolInputException("'" + name + "' must be a string.");
        }
        return text.isBlank() ? Optional.empty() : Optional.of(text);
    }

    boolean bool(String name) {
        if (!(values.get(name) instanceof Boolean flag)) {
            throw new ToolInputException("'" + name + "' must be true or false.");
        }
        return flag;
    }

    int integer(String name) {
        return optionalInteger(name).orElseThrow(() -> new ToolInputException("'" + name + "' is required."));
    }

    Optional<Integer> optionalInteger(String name) {
        Object value = values.get(name);
        if (value == null) {
            return Optional.empty();
        }
        if (!(value instanceof Number number) || number.doubleValue() != Math.rint(number.doubleValue())) {
            throw new ToolInputException("'" + name + "' must be a whole number.");
        }
        return Optional.of(number.intValue());
    }

    List<String> strings(String name) {
        Object value = values.get(name);
        if (!(value instanceof List<?> list) || !list.stream().allMatch(String.class::isInstance)) {
            throw new ToolInputException("'" + name + "' must be a list of strings.");
        }
        return list.stream().map(String.class::cast).toList();
    }

    Object raw(String name) {
        Object value = values.get(name);
        if (value == null) {
            throw new ToolInputException("'" + name + "' is required.");
        }
        return value;
    }
}
