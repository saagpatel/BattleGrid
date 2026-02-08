use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct PlayerId(pub u8);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct UnitId(pub u16);

impl std::fmt::Display for PlayerId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Player({})", self.0)
    }
}

impl std::fmt::Display for UnitId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Unit({})", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_id_ord() {
        assert!(PlayerId(0) < PlayerId(1));
        assert!(PlayerId(1) < PlayerId(255));
    }

    #[test]
    fn unit_id_ord() {
        assert!(UnitId(0) < UnitId(1));
        assert!(UnitId(100) < UnitId(200));
    }

    #[test]
    fn serde_roundtrip() {
        let pid = PlayerId(7);
        let bytes = bincode::serialize(&pid).unwrap();
        let decoded: PlayerId = bincode::deserialize(&bytes).unwrap();
        assert_eq!(pid, decoded);

        let uid = UnitId(1234);
        let bytes = bincode::serialize(&uid).unwrap();
        let decoded: UnitId = bincode::deserialize(&bytes).unwrap();
        assert_eq!(uid, decoded);
    }
}
