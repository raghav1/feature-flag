package dev.flags.backend.auth;

/** A row of app_user. Only the auth package sees the password hash. */
record StoredUser(String username, String passwordHash, Role role) {}
