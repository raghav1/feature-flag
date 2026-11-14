package dev.flags.engine;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Published MurmurHash3_x86_32 reference vectors. Covers empty input, every tail length and multi-block input. */
class Murmur3Test {

    @ParameterizedTest(name = "\"{0}\" seed {1}")
    @CsvSource(delimiter = '|', textBlock = """
            ''                                            | 0x00000000 | 0x00000000
            ''                                            | 0x00000001 | 0x514E28B7
            ''                                            | 0xFFFFFFFF | 0x81F16F39
            hello                                         | 0x00000000 | 0x248BFA47
            a                                             | 0x9747B28C | 0x7FA09EA6
            ab                                            | 0x9747B28C | 0x74875592
            abc                                           | 0x9747B28C | 0xC84A62DD
            abcd                                          | 0x9747B28C | 0xF0478627
            aa                                            | 0x9747B28C | 0x5D211726
            aaa                                           | 0x9747B28C | 0x283E0130
            aaaa                                          | 0x9747B28C | 0x5A97808A
            'Hello, world!'                               | 0x9747B28C | 0x24884CBA
            The quick brown fox jumps over the lazy dog   | 0x9747B28C | 0x2FA826CD
            """)
    void matchesReferenceVectors(String input, String seed, String expected) {
        int hash = Murmur3.hash32(input.getBytes(StandardCharsets.UTF_8), Integer.parseUnsignedInt(seed.substring(2), 16));

        assertThat(hash).isEqualTo(Integer.parseUnsignedInt(expected.substring(2), 16));
    }

    @Test
    void hashesFourZeroBytes() {
        assertThat(Murmur3.hash32(new byte[4], 0)).isEqualTo(Integer.parseUnsignedInt("2362F9DE", 16));
    }
}
