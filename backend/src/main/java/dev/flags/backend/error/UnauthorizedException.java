package dev.flags.backend.error;

/** Missing or wrong credentials (e.g. SDK key). Maps to 401. */
public class UnauthorizedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public UnauthorizedException(String message) {
        super(message);
    }
}
