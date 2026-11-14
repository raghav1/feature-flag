package dev.flags.backend.error;

/** Duplicate key or a stale version. Maps to 409. */
public class ConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ConflictException(String message) {
        super(message);
    }
}
