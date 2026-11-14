package dev.flags.backend.mcp;

/** A tool was called with missing or malformed arguments. Shown to the agent as a tool error. */
class ToolInputException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    ToolInputException(String message) {
        super(message);
    }
}
