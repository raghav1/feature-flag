package dev.flags.backend.evaluation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Optional;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

/** SDK keys from configuration ({@code app.sdk-keys.<env>}), compared in constant time. */
@Component
@EnableConfigurationProperties(ConfiguredSdkKeys.Properties.class)
class ConfiguredSdkKeys implements SdkKeys {

    @ConfigurationProperties("app")
    record Properties(Map<String, String> sdkKeys) {
        Properties {
            sdkKeys = sdkKeys == null ? Map.of() : Map.copyOf(sdkKeys);
        }
    }

    private final Map<String, String> keysByEnvironment;

    ConfiguredSdkKeys(Properties properties) {
        this.keysByEnvironment = properties.sdkKeys();
    }

    @Override
    public Optional<String> environmentFor(String sdkKey) {
        byte[] given = sdkKey.getBytes(StandardCharsets.UTF_8);
        return keysByEnvironment.entrySet().stream()
                .filter(e -> MessageDigest.isEqual(e.getValue().getBytes(StandardCharsets.UTF_8), given))
                .map(Map.Entry::getKey)
                .findFirst();
    }
}
