use std::collections::HashMap;

use tokio::time::{Duration, Instant};

/// Default grace period for disconnected players (30 seconds).
const DEFAULT_GRACE_PERIOD_MS: u64 = 30_000;

/// Tracks disconnected players and their grace period for reconnection.
///
/// When a player disconnects during a game, they get a grace period to
/// reconnect. If they don't reconnect in time, they forfeit.
#[allow(dead_code)]
pub struct DisconnectTracker {
    /// player_id -> disconnect timestamp
    disconnected: HashMap<u8, Instant>,
    grace_period: Duration,
}

#[allow(dead_code)]
impl DisconnectTracker {
    pub fn new() -> Self {
        Self {
            disconnected: HashMap::new(),
            grace_period: Duration::from_millis(DEFAULT_GRACE_PERIOD_MS),
        }
    }

    pub fn with_grace_period(grace_period_ms: u64) -> Self {
        Self {
            disconnected: HashMap::new(),
            grace_period: Duration::from_millis(grace_period_ms),
        }
    }

    /// Record a player disconnect.
    pub fn player_disconnected(&mut self, player_id: u8) {
        self.disconnected.insert(player_id, Instant::now());
    }

    /// Record a player reconnect. Returns true if the player was disconnected.
    pub fn player_reconnected(&mut self, player_id: u8) -> bool {
        self.disconnected.remove(&player_id).is_some()
    }

    /// Check if a player is currently disconnected.
    pub fn is_disconnected(&self, player_id: u8) -> bool {
        self.disconnected.contains_key(&player_id)
    }

    /// Get all players whose grace period has expired (forfeited).
    pub fn expired_players(&self) -> Vec<u8> {
        let now = Instant::now();
        self.disconnected
            .iter()
            .filter(|(_, &disconnect_time)| {
                now.duration_since(disconnect_time) >= self.grace_period
            })
            .map(|(&player_id, _)| player_id)
            .collect()
    }

    /// Remove a player from tracking (e.g., after forfeit is processed).
    pub fn remove(&mut self, player_id: u8) {
        self.disconnected.remove(&player_id);
    }

    /// Check if any players are currently disconnected.
    pub fn has_disconnected_players(&self) -> bool {
        !self.disconnected.is_empty()
    }

    /// Get remaining grace period for a disconnected player in milliseconds.
    pub fn remaining_grace_ms(&self, player_id: u8) -> Option<u64> {
        self.disconnected.get(&player_id).map(|&disconnect_time| {
            let elapsed = Instant::now().duration_since(disconnect_time);
            self.grace_period
                .checked_sub(elapsed)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        })
    }
}

impl Default for DisconnectTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_tracker_has_no_disconnects() {
        let tracker = DisconnectTracker::new();
        assert!(!tracker.has_disconnected_players());
        assert!(!tracker.is_disconnected(0));
    }

    #[test]
    fn track_disconnect() {
        let mut tracker = DisconnectTracker::new();
        tracker.player_disconnected(1);

        assert!(tracker.is_disconnected(1));
        assert!(!tracker.is_disconnected(0));
        assert!(tracker.has_disconnected_players());
    }

    #[test]
    fn track_reconnect() {
        let mut tracker = DisconnectTracker::new();
        tracker.player_disconnected(1);
        assert!(tracker.is_disconnected(1));

        let was_disconnected = tracker.player_reconnected(1);
        assert!(was_disconnected);
        assert!(!tracker.is_disconnected(1));
    }

    #[test]
    fn reconnect_unknown_player() {
        let mut tracker = DisconnectTracker::new();
        let was_disconnected = tracker.player_reconnected(99);
        assert!(!was_disconnected);
    }

    #[test]
    fn remaining_grace_for_unknown_player() {
        let tracker = DisconnectTracker::new();
        assert!(tracker.remaining_grace_ms(42).is_none());
    }

    #[test]
    fn remaining_grace_starts_near_full() {
        let mut tracker = DisconnectTracker::with_grace_period(30_000);
        tracker.player_disconnected(0);

        let remaining = tracker.remaining_grace_ms(0).expect("should exist");
        assert!(
            remaining > 29_000,
            "remaining should be near 30s, got {remaining}"
        );
    }

    #[tokio::test]
    async fn expired_after_grace_period() {
        let mut tracker = DisconnectTracker::with_grace_period(50); // 50ms grace
        tracker.player_disconnected(0);

        // Not expired yet
        assert!(tracker.expired_players().is_empty());

        // Wait for grace period
        tokio::time::sleep(Duration::from_millis(60)).await;

        let expired = tracker.expired_players();
        assert_eq!(expired, vec![0]);
    }

    #[test]
    fn remove_stops_tracking() {
        let mut tracker = DisconnectTracker::new();
        tracker.player_disconnected(0);
        tracker.remove(0);
        assert!(!tracker.is_disconnected(0));
        assert!(!tracker.has_disconnected_players());
    }

    #[test]
    fn default_impl() {
        let tracker = DisconnectTracker::default();
        assert!(!tracker.has_disconnected_players());
    }
}
