# Midnight Ticketing Demo

Privacy-preserving single-use ticket / coupon prototype built atop the existing `hello-world` Compact contract by serializing a JSON state blob into its `message` cell.

## Overview

On-chain we store:
1. Merkle root of issued ticket leaves
2. Array of used ticket nullifiers (one-way hash of secret)
3. `maxAgeMs` validity window
4. `leafCount` and `depth` metadata

Locally we keep full ticket records and Merkle structure (`.tickets.local.json`). Redemption is proven locally (inclusion + freshness + uniqueness) before we append the nullifier on-chain.

## Flows

### Issue
1. Generate random secret
2. Compute leaf = SHA256(secret || issuedAt)
3. Append to local Merkle tree
4. Publish updated root & leafCount on-chain by calling `storeMessage(JSON)`

### Redeem
1. User supplies secret + issuedAt
2. Local proof (Merkle path) reconstructed
3. Check: not expired, nullifier unused, inclusion verifies
4. Append nullifier on-chain

### Nullifier
`nullifier = SHA256("nullifier:" || secret)` prevents double use without revealing secret.

## Circuit Spec (Future ZK Integration)

Public inputs:
- `root`
- `nullifier`
- `maxAgeMs`
- `currentTimeMs`

Private inputs:
- Path sibling nodes
- Leaf index
- `secret`
- `issuedAt`

Checks:
1. Recompute `leaf = H(secret || issuedAt)`
2. Merkle inclusion ⇒ produces `root`
3. `currentTimeMs <= issuedAt + maxAgeMs`
4. Constrain `nullifier = H("nullifier:" || secret)`
5. Enforce nullifier not already present (migrated to on-chain set membership proof later via separate incremental structure or an accumulator circuit).

Output: single boolean `valid` (implicit via proof success) and public `nullifier`.

## Running

```bash
npm run build
npm run deploy   # deploy hello-world contract (stores blank state initially)
npm run cli      # interactive menu
# UI demo (local)
npm run server   # terminal 1: start REST API on :4000
npm run ui:dev   # terminal 2: start Vite on :5173 (proxied to :4000)
```

Menu options:
1. Initialize ticket parameters
2. Issue a ticket (prints secret, index)
3. Redeem a ticket (requires secret + issuedAt)
4. Show on-chain JSON state
5. Exit

## File Map
- `src/lib/merkle.ts` – Merkle tree utility (fixed-depth, append-only)
- `src/tickets/state.ts` – Local ticket manager & redemption verification
- `src/cli.ts` – Extended CLI (serialization into contract)
- `src/server.ts` – REST API for UI demo (/api/*)
- `ui/*` – Vite + React frontend

## Limitations
- Not a real ZK circuit yet; privacy relies on not publishing individual leaves.
- Nullifiers stored as array; scalability requires a set structure or batched Merkle.
- Replay protection assumes honest client for writing nullifier.
- Issuance count leaks through `leafCount` changes.

## Next Steps
1. Implement a custom Compact contract for dedicated fields instead of JSON-in-string.
2. Add a real ZK proof provider circuit for redemption.
3. Migrate nullifiers to separate Merkle tree and prove non-membership via updatable accumulator or use differential sets.
4. Add tests (`jest` or `vitest`) to exercise issuing and redemption edge cases.
5. Harden randomness (use crypto module for secret generation).

## Edge Cases Considered
- Expired ticket attempts ⇒ rejected locally.
- Double redemption ⇒ nullifier found.
- Invalid Merkle proof ⇒ rejected.
- Tree full ⇒ issuance throws error.

## Security Notes
Do not log or persist secrets in production beyond user custody. Use secure randomness (`crypto.randomBytes`). Consider rate limiting issuance & redemption to mitigate brute-force attempts.

## License
Prototype / educational purposes.
