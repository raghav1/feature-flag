package dev.flags.backend.auth;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
class DbUserDetailsService implements UserDetailsService {

    private final UserRepository users;

    DbUserDetailsService(UserRepository users) {
        this.users = users;
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        return users.findByUsername(username)
                .map(u -> User.withUsername(u.username()).password(u.passwordHash()).roles(u.role().name()).build())
                .orElseThrow(() -> new UsernameNotFoundException(username));
    }
}
