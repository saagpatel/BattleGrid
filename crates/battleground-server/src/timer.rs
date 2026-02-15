use std::sync::Arc;

use tokio::sync::Notify;
use tokio::time::{Duration, Instant};

/// Turn timer that enforces deadlines via tokio.
///
/// The timer is started when a phase begins (deployment or planning).
/// When the deadline expires, the `expired` notify is triggered.
/// The timer can be cancelled when all submissions arrive early.
pub struct TurnTimer {
    deadline: Instant,
    duration: Duration,
    cancel: Arc<Notify>,
    expired: Arc<Notify>,
}

impl TurnTimer {
    /// Create a new timer with the given duration in milliseconds.
    pub fn new(duration_ms: u64) -> Self {
        let duration = Duration::from_millis(duration_ms);
        Self {
            deadline: Instant::now() + duration,
            duration,
            cancel: Arc::new(Notify::new()),
            expired: Arc::new(Notify::new()),
        }
    }

    /// Start the timer. Spawns a background task that will notify `expired`
    /// when the deadline passes (unless cancelled first).
    pub fn start(&mut self) -> TurnTimerHandle {
        self.deadline = Instant::now() + self.duration;
        let cancel = self.cancel.clone();
        let expired = self.expired.clone();
        let deadline = self.deadline;

        tokio::spawn(async move {
            tokio::select! {
                () = tokio::time::sleep_until(deadline) => {
                    expired.notify_waiters();
                }
                () = cancel.notified() => {
                    // Timer cancelled — all players submitted early
                }
            }
        });

        TurnTimerHandle {
            cancel: self.cancel.clone(),
            expired: self.expired.clone(),
        }
    }

    /// Get the remaining time in milliseconds.
    pub fn remaining_ms(&self) -> u64 {
        let now = Instant::now();
        if now >= self.deadline {
            0
        } else {
            (self.deadline - now).as_millis() as u64
        }
    }
}

/// Handle to interact with a running timer.
#[derive(Clone)]
pub struct TurnTimerHandle {
    cancel: Arc<Notify>,
    expired: Arc<Notify>,
}

impl TurnTimerHandle {
    /// Cancel the timer (all players submitted early).
    pub fn cancel(&self) {
        self.cancel.notify_one();
    }

    /// Wait for the timer to expire. Returns immediately if already expired.
    pub async fn wait_expired(&self) {
        self.expired.notified().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn timer_expires_after_duration() {
        let mut timer = TurnTimer::new(50); // 50ms
        let handle = timer.start();

        handle.wait_expired().await;
        assert_eq!(timer.remaining_ms(), 0);
    }

    #[tokio::test]
    async fn timer_can_be_cancelled() {
        let mut timer = TurnTimer::new(5000); // 5 seconds
        let handle = timer.start();

        // Cancel immediately
        handle.cancel();

        // Wait a bit to ensure the cancel took effect
        tokio::time::sleep(Duration::from_millis(10)).await;

        // Timer should still have remaining time (was cancelled, not expired)
        assert!(timer.remaining_ms() > 0);
    }

    #[test]
    fn remaining_starts_at_duration() {
        let timer = TurnTimer::new(30_000);
        // Should be close to 30s (minus tiny overhead)
        assert!(timer.remaining_ms() > 29_000);
    }

    #[tokio::test]
    async fn timer_restart() {
        let mut timer = TurnTimer::new(50);
        let handle1 = timer.start();
        handle1.cancel();

        // Restart
        let handle2 = timer.start();
        handle2.wait_expired().await;
        assert_eq!(timer.remaining_ms(), 0);
    }
}
