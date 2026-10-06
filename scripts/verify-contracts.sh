#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

# A native Linux cache avoids slow compilation on WSL's mounted Windows drive.
# Override CARGO_TARGET_DIR if you want Cargo's usual workspace output instead.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/var/tmp/caveat-linux-verify/target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
export CARGO_PROFILE_DEV_DEBUG=0
export CARGO_PROFILE_TEST_DEBUG=0

rustc --version
cargo --version
cargo fmt --manifest-path contracts/Cargo.toml --all --check
cargo test --locked --manifest-path contracts/Cargo.toml
cargo build --locked --manifest-path contracts/Cargo.toml --target wasm32v1-none --release

wasm_dir="$project_dir/contracts/target/wasm32v1-none/release"
mkdir -p "$wasm_dir"
for contract in caveat_account caveat_demo_router caveat_executor; do
  built_wasm="$CARGO_TARGET_DIR/wasm32v1-none/release/$contract.wasm"
  if ! [[ "$built_wasm" -ef "$wasm_dir/$contract.wasm" ]]; then
    cp "$built_wasm" "$wasm_dir/$contract.wasm"
  fi
done
cd "$wasm_dir"
sha256sum caveat_account.wasm caveat_demo_router.wasm caveat_executor.wasm | tee SHA256SUMS
