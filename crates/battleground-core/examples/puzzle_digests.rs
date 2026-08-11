use battleground_core::puzzle::PuzzleDefinitionV1;

fn main() {
    let paths = std::env::args().skip(1).collect::<Vec<_>>();
    if paths.is_empty() {
        eprintln!("usage: puzzle_digests <puzzle.json> [...]");
        std::process::exit(2);
    }
    for path in paths {
        let json = std::fs::read_to_string(&path).unwrap_or_else(|error| {
            panic!("failed to read {path}: {error}");
        });
        let definition = PuzzleDefinitionV1::from_json(&json).unwrap_or_else(|error| {
            panic!("failed to parse {path}: {error}");
        });
        let digests = definition.computed_digests().unwrap_or_else(|error| {
            panic!("failed to compute {path}: {error}");
        });
        println!("{path}");
        println!("  gameplay_definition={}", digests.gameplay_definition);
        println!("  initial_state={}", digests.initial_state);
        println!("  reference_trace={}", digests.reference_trace);
    }
}
