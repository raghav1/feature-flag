package dev.flags.backend.error;

/** The user is logged in but their role doesn't allow this. Maps to 403. */
public class ForbiddenException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ForbiddenException(String message) {
        super(message);
    }
}
