package dev.flags.engine;

/** Why an evaluation produced its value. */
public enum Reason {
    /** The flag is disabled in this environment. */
    FLAG_OFF,
    /** A rule matched; see {@link EvaluationResult#matchedRuleIndex()}. */
    RULE_MATCH,
    /** The flag is enabled but no rule matched, so the "otherwise" value was served. */
    OTHERWISE,
    /** No flag with that key exists. */
    FLAG_NOT_FOUND
}
