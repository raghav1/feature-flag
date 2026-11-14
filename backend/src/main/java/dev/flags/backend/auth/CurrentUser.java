package dev.flags.backend.auth;

/** The user making the current request. */
public interface CurrentUser {

    /** @throws IllegalStateException if nobody is logged in (security config should make that impossible) */
    AppUser get();
}
