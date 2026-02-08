use std::env;

/// Server configuration loaded from environment variables with sensible defaults.
#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub max_rooms: usize,
    pub log_level: String,
    pub turn_timer_ms: u64,
}

impl ServerConfig {
    /// Load configuration from environment variables with defaults.
    pub fn from_env() -> Self {
        Self {
            port: parse_env("PORT", 3001),
            max_rooms: parse_env("MAX_ROOMS", 100),
            log_level: env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
            turn_timer_ms: parse_env("TURN_TIMER_MS", 30_000),
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3001,
            max_rooms: 100,
            log_level: "info".to_string(),
            turn_timer_ms: 30_000,
        }
    }
}

fn parse_env<T: std::str::FromStr>(key: &str, default: T) -> T {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_values() {
        let config = ServerConfig::default();
        assert_eq!(config.port, 3001);
        assert_eq!(config.max_rooms, 100);
        assert_eq!(config.log_level, "info");
        assert_eq!(config.turn_timer_ms, 30_000);
    }

    #[test]
    fn parse_env_returns_default_for_missing_key() {
        // Use a key that won't be set by any other test
        let val: u16 = parse_env("__BATTLEGROUND_TEST_MISSING_KEY__", 42);
        assert_eq!(val, 42);
    }

    #[test]
    fn parse_env_returns_default_for_unparseable() {
        // Use a unique key per test to avoid races
        env::set_var("__BATTLEGROUND_TEST_BAD_PORT__", "not_a_number");
        let val: u16 = parse_env("__BATTLEGROUND_TEST_BAD_PORT__", 3001);
        assert_eq!(val, 3001);
        env::remove_var("__BATTLEGROUND_TEST_BAD_PORT__");
    }

    #[test]
    fn parse_env_reads_valid_value() {
        env::set_var("__BATTLEGROUND_TEST_GOOD_PORT__", "9999");
        let val: u16 = parse_env("__BATTLEGROUND_TEST_GOOD_PORT__", 3001);
        assert_eq!(val, 9999);
        env::remove_var("__BATTLEGROUND_TEST_GOOD_PORT__");
    }
}
