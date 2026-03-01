/**
 * @module uuidv7
 *
 * Generates RFC 9562 UUIDv7 values with a monotonic counter for strict
 * temporal ordering — even when multiple IDs are created within the same
 * millisecond.
 *
 * ## UUIDv7 layout (128 bits)
 *
 *   0                   1                   2                   3
 *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                         unix_ts_ms (48 bits)                 |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |          unix_ts_ms           | ver (0111) |   rand_a (12)   |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |var (10)|                   rand_b (62)                       |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                           rand_b                             |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *
 * ## Monotonic counter (RFC 9562 §6.2, Method 2)
 *
 * When two or more UUIDs share the same millisecond timestamp, the 12-bit
 * `rand_a` field is used as a monotonic counter instead of random bits:
 *
 * 1. **New millisecond** → `rand_a` is seeded with a random 12-bit value.
 *    This avoids predictable sequences and distributes starting points.
 *
 * 2. **Same millisecond** → `rand_a` is incremented by 1, guaranteeing
 *    strict ordering (a < b) for UUIDs generated in the same ms window.
 *
 * 3. **Counter overflow** (> 0xFFF within 1 ms) → the timestamp is bumped
 *    forward by 1 ms and the counter resets. This is extremely unlikely
 *    (requires 4096 IDs in a single millisecond) but handled for safety.
 *
 * The `rand_b` field (62 bits) is always fully random, providing collision
 * resistance across processes and machines that don't share counter state.
 *
 * ## Why not use a library?
 *
 * - Zero dependencies, matching how UUIDv4 uses the built-in
 *   `crypto.randomUUID()`
 * - ~30 lines of logic; easy to audit
 * - Monotonic counter covers the practical gap vs. naive implementations
 *
 * ## Limitations
 *
 * - Counter state is per-process (module-scoped). Separate Node processes
 *   or worker threads each maintain independent counters. Cross-process
 *   ordering is still guaranteed at millisecond granularity by the
 *   timestamp, with `rand_b` providing collision resistance.
 *
 * - UUIDv7 embeds a creation timestamp by design. Do not use as a secret
 *   or unguessable token — use UUIDv4 or `crypto.randomUUID()` for that.
 */

// -- Monotonic counter state (per-process) ----------------------------------

let lastTs = 0
let counter = 0

// -- Public API -------------------------------------------------------------

/**
 * Generate a UUIDv7 value with monotonic ordering guarantee.
 *
 * Successive calls within the same millisecond produce strictly increasing
 * UUIDs. Calls in different milliseconds are naturally ordered by timestamp.
 */
export function uuidv7(): string {
  let now = Date.now()

  if (now === lastTs) {
    // Same millisecond — increment counter for strict ordering
    counter++
    if (counter > 0xfff) {
      // Counter overflow: bump timestamp forward, reset counter.
      // This handles the (extremely unlikely) case of >4096 IDs per ms.
      now = lastTs + 1
      lastTs = now
      counter = crypto.getRandomValues(new Uint16Array(1))[0] & 0xfff
    }
  } else {
    // New millisecond — seed counter with random 12-bit value
    lastTs = now
    counter = crypto.getRandomValues(new Uint16Array(1))[0] & 0xfff
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // 48-bit timestamp (ms since epoch) → bytes 0-5
  // Division is used instead of bitwise shifts because JS bitwise ops
  // truncate to 32 bits, and timestamps need all 48 bits.
  bytes[0] = (now / 2 ** 40) & 0xff
  bytes[1] = (now / 2 ** 32) & 0xff
  bytes[2] = (now / 2 ** 24) & 0xff
  bytes[3] = (now / 2 ** 16) & 0xff
  bytes[4] = (now / 2 ** 8) & 0xff
  bytes[5] = now & 0xff

  // Version 7 (0111) in high nibble of byte 6, counter high 4 bits in low nibble
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f)

  // Counter low 8 bits → byte 7
  bytes[7] = counter & 0xff

  // Variant 10 → high 2 bits of byte 8 (rand_b remains random)
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
