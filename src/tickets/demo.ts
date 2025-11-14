// Local test harness for ticket system logic without blockchain interaction.
import { TicketSystem, verifyRedemption, nullifierFromSecret } from "./state.js";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    console.log("TicketSystem Demo Test\n");
    // Initialize a small tree for speed
    const depth = 4; // 16 leaves max
    const maxAgeMs = 2000; // 2 seconds for expiry test
    const system = new TicketSystem(depth, maxAgeMs);

    // Issue two tickets
    const t1 = system.issueTicket();
    const t2 = system.issueTicket();
    console.log("Issued t1, t2");
    console.log({ t1, t2 });

    // Build on-chain mock state (no nullifiers yet)
    let onchain = system.toOnChainState([]);

    // Redeem t1 successfully
    let attempt1 = {
        secret: t1.secret,
        issuedAt: t1.issuedAt,
        proof: system.generateProof(t1),
        nullifier: nullifierFromSecret(t1.secret)
    };
    let res1 = verifyRedemption(onchain, attempt1, Date.now());
    console.log("Redeem t1 valid:", res1);
    if (res1.ok) onchain.nullifiers.push(attempt1.nullifier);

    // Attempt double spend t1
    let resDouble = verifyRedemption(onchain, attempt1, Date.now());
    console.log("Redeem t1 again (should fail):", resDouble);

    // Wait for expiry window to test t2 expiry
    console.log("Waiting for t2 to expire...");
    await sleep(maxAgeMs + 10);
    let attempt2 = {
        secret: t2.secret,
        issuedAt: t2.issuedAt,
        proof: system.generateProof(t2),
        nullifier: nullifierFromSecret(t2.secret)
    };
    let res2 = verifyRedemption(onchain, attempt2, Date.now());
    console.log("Redeem t2 after expiry (should fail):", res2);

    // Summary assertions (simple console checks)
    const allOk = res1.ok && !resDouble.ok && !res2.ok;
    console.log("\nSummary: ", allOk ? "PASS" : "FAIL");
    process.exit(allOk ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
