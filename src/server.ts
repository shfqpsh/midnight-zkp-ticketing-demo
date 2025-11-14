import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TicketSystem, verifyRedemption, nullifierFromSecret } from "./tickets/state.js";
import { MerkleTree, Hash, leafFromTicket } from "./lib/merkle.js";
import { WalletBuilder } from "@midnight-ntwrk/wallet";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NetworkId, setNetworkId, getZswapNetworkId, getLedgerNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { WebSocket } from "ws";

// Fix WebSocket for Node.js env (for Midnight libs)
// @ts-ignore
globalThis.WebSocket = WebSocket;

// Configure for Midnight Testnet (align with CLI)
setNetworkId(NetworkId.TestNet);

const TESTNET_CONFIG = {
    indexer: "https://indexer.testnet-02.midnight.network/api/v1/graphql",
    indexerWS: "wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws",
    node: "https://rpc.testnet-02.midnight.network",
    proofServer: "http://127.0.0.1:6300"
};

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = process.env.TICKETS_DATA_DIR || process.cwd();
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
const ONCHAIN_FILE = path.join(DATA_DIR, ".tickets.onchain.json");
const ISSUER_FILE = path.join(DATA_DIR, ".issuer.tree.json"); // for realistic flow: issuer stores only leaves
const PAYMENTS_FILE = path.join(DATA_DIR, ".payments.json"); // track used txIds to prevent reuse in demo

function readOnchain() {
    if (!fs.existsSync(ONCHAIN_FILE)) return { version: 1, root: "", maxAgeMs: 0, nullifiers: [], leafCount: 0, depth: 16 };
    return JSON.parse(fs.readFileSync(ONCHAIN_FILE, "utf-8"));
}
function writeOnchain(obj: any) {
    fs.writeFileSync(ONCHAIN_FILE, JSON.stringify(obj, null, 2));
}

function readIssuerTree(): { depth: number; leaves: Hash[]; maxAgeMs: number } | null {
    if (!fs.existsSync(ISSUER_FILE)) return null;
    return JSON.parse(fs.readFileSync(ISSUER_FILE, "utf-8"));
}
function writeIssuerTree(obj: { depth: number; leaves: Hash[]; maxAgeMs: number }) {
    fs.writeFileSync(ISSUER_FILE, JSON.stringify(obj, null, 2));
}

function readPayments(): { usedTxIds: string[] } {
    if (!fs.existsSync(PAYMENTS_FILE)) return { usedTxIds: [] };
    return JSON.parse(fs.readFileSync(PAYMENTS_FILE, "utf-8"));
}
function writePayments(obj: { usedTxIds: string[] }) {
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(obj, null, 2));
}

// Hard-coded receiver address (requested)
const HARDCODED_ISSUER_ADDRESS = "mn_shield-addr_test1lz3swvmx3nuh5f98857se90cmc9fqe0hg26mf6gkctaslsr3su2sxqpyyjdmdtulmjetd2w4g52r2pm4u6pahcv5pd8y7ukljkpgy5a2qg83reu6";
let issuerAddress: string = HARDCODED_ISSUER_ADDRESS;

// Optional: If ISSUER_SEED is provided, override the hard-coded address with derived one
(async () => {
    try {
        const seed = process.env.ISSUER_SEED;
        if (!seed) {
            console.log("Using hard-coded issuer address:", issuerAddress);
            return;
        }
        const wallet = await WalletBuilder.buildFromSeed(
            TESTNET_CONFIG.indexer,
            TESTNET_CONFIG.indexerWS,
            TESTNET_CONFIG.proofServer,
            TESTNET_CONFIG.node,
            seed,
            getZswapNetworkId(),
            "warn"
        );
        wallet.start();
        const state = await (await import("rxjs")).firstValueFrom(wallet.state());
        issuerAddress = state.address;
        await wallet.close();
        console.log("Issuer address (from seed):", issuerAddress);
    } catch (e) {
        console.warn("Failed to initialize issuer wallet; falling back to hard-coded address:", issuerAddress, "-", (e as any)?.message || e);
    }
})();

app.get("/api/state", (_req: Request, res: Response) => {
    res.json(readOnchain());
});

app.get("/api/tickets", (_req: Request, res: Response) => {
    const system = TicketSystem.fromLocal();
    res.json({ tickets: system ? system.getRecords() : [] });
});

// Payment info (for Lace Midnight Preview demo)
app.get("/api/payment-info", (_req: Request, res: Response) => {
    // Price: 10 tDust (as requested)
    const priceTdust = 10; // integer tDust units
    res.json({ ok: true, issuerAddress, priceTdust, network: "Midnight Testnet" });
});

app.post("/api/init", (req: Request, res: Response) => {
    try {
        const { maxAgeHours, depth } = req.body as { maxAgeHours: number; depth: number };
        if (maxAgeHours == null || isNaN(Number(maxAgeHours))) {
            return res.status(400).json({ ok: false, reason: "maxAgeHours must be a number" });
        }
        if (depth == null || isNaN(Number(depth)) || Number(depth) <= 0 || Number(depth) > 32) {
            return res.status(400).json({ ok: false, reason: "depth must be an integer between 1 and 32" });
        }
        const maxAgeMs = Math.floor(Number(maxAgeHours) * 60 * 60 * 1000);
        const d = Number(depth);
        // Initialize local system file too
        const system = new TicketSystem(d, maxAgeMs);
        system.saveLocal();
        const onchain = { version: 1, root: "", maxAgeMs, nullifiers: [], leafCount: 0, depth: d };
        writeOnchain(onchain);
        // Initialize issuer-only tree (no secrets)
        writeIssuerTree({ depth: d, leaves: [], maxAgeMs });
        res.json({ ok: true, ...onchain });
    } catch (e: any) {
        res.status(500).json({ ok: false, reason: e?.message || 'init failed' });
    }
});

// Reset all local demo state (issued tickets, issuer leaves, onchain JSON)
const doReset = (_req: Request, res: Response) => {
    try {
        const localPath = path.join(DATA_DIR, '.tickets.local.json');
        const onchainPath = path.join(DATA_DIR, '.tickets.onchain.json');
        const issuerPath = path.join(DATA_DIR, '.issuer.tree.json');
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        if (fs.existsSync(onchainPath)) fs.unlinkSync(onchainPath);
        if (fs.existsSync(issuerPath)) fs.unlinkSync(issuerPath);
    } catch { }
    res.json({ ok: true });
};
app.post('/api/reset', doReset);
app.get('/api/reset', doReset);

app.post("/api/issue", (_req: Request, res: Response) => {
    try {
        let onchain = readOnchain();
        if (!onchain.depth || !onchain.maxAgeMs) return res.status(400).json({ ok: false, reason: "Not initialized" });
        let system = TicketSystem.fromLocal() || new TicketSystem(onchain.depth, onchain.maxAgeMs);
        const rec = system.issueTicket();
        onchain.root = system.getRoot();
        onchain.leafCount = system.getLeafCount();
        writeOnchain(onchain);
        res.json({ ticket: rec, onchain });
    } catch (e: any) {
        if ((e?.message || "").includes("Merkle tree is full")) {
            return res.status(409).json({ ok: false, reason: "Merkle tree is full" });
        }
        res.status(500).json({ ok: false, reason: e?.message || 'issue failed' });
    }
});

app.post("/api/redeem", (req: Request, res: Response) => {
    const { secret, issuedAt } = req.body as { secret: string; issuedAt: number };
    const system = TicketSystem.fromLocal();
    if (!system) return res.status(400).json({ ok: false, reason: "No local tickets" });
    const rec = system.getRecords().find(r => r.secret === secret && r.issuedAt === issuedAt);
    if (!rec) return res.status(404).json({ ok: false, reason: "Ticket not found" });
    const proof = system.generateProof(rec);
    const onchain = readOnchain();
    const attempt = { secret, issuedAt, proof, nullifier: nullifierFromSecret(secret) } as any;
    const result = verifyRedemption(onchain, attempt, Date.now());
    if (!result.ok) return res.status(400).json({ ok: false, reason: result.reason });
    onchain.nullifiers = onchain.nullifiers || [];
    onchain.nullifiers.push(attempt.nullifier);
    writeOnchain(onchain);
    res.json({ ok: true, nullifier: attempt.nullifier, onchain });
});

// Redemption for realistic flow: validate by computing leaf from secret+issuedAt
// and checking membership in issuer's leaves set. Records nullifier only if valid and unexpired.
app.post("/api/redeem-leaf", (req: Request, res: Response) => {
    const { secret, issuedAt } = req.body as { secret: string; issuedAt: number };
    if (!secret || !issuedAt) return res.status(400).json({ ok: false, reason: "Missing secret or issuedAt" });
    const issuer = readIssuerTree();
    if (!issuer) return res.status(400).json({ ok: false, reason: "Not initialized" });
    const onchain = readOnchain();
    // Expiry check
    const now = Date.now();
    if (onchain.maxAgeMs && (now > (Number(issuedAt) + Number(onchain.maxAgeMs)))) {
        return res.status(400).json({ ok: false, reason: "Ticket expired" });
    }
    const leaf = leafFromTicket(secret, Number(issuedAt));
    const idx = issuer.leaves.indexOf(leaf);
    if (idx < 0) return res.status(404).json({ ok: false, reason: "Ticket not found" });
    const n = nullifierFromSecret(secret);
    onchain.nullifiers = onchain.nullifiers || [];
    if (onchain.nullifiers.includes(n)) return res.status(400).json({ ok: false, reason: "Already used" });
    onchain.nullifiers.push(n);
    writeOnchain(onchain);
    return res.json({ ok: true, nullifier: n, onchain, index: idx });
});

// --- Realistic flow (issuer-only leaves, wallet issues via leaf) ---
app.post("/api/issue-leaf", (req: Request, res: Response) => {
    const { leaf } = req.body as { leaf: Hash };
    if (!leaf) return res.status(400).json({ ok: false, reason: "Missing leaf" });
    const issuer = readIssuerTree();
    if (!issuer) return res.status(400).json({ ok: false, reason: "Not initialized" });
    // Prevent duplicate issuance of the same leaf
    if (issuer.leaves.includes(leaf)) {
        return res.status(409).json({ ok: false, reason: "Leaf already issued" });
    }
    // Enforce Merkle capacity
    const capacity = 1 << issuer.depth;
    if (issuer.leaves.length >= capacity) {
        return res.status(409).json({ ok: false, reason: "Merkle tree is full" });
    }
    const leaves = issuer.leaves.slice();
    leaves.push(leaf);
    const tree = new MerkleTree(issuer.depth, leaves);
    writeIssuerTree({ depth: issuer.depth, leaves, maxAgeMs: issuer.maxAgeMs });
    const onchain = readOnchain();
    onchain.root = tree.getRoot();
    onchain.leafCount = leaves.length;
    writeOnchain(onchain);
    res.json({ index: leaves.length - 1, onchain });
});

// Hardened nullifier recording: require secret + issuedAt so we can validate membership
// in issuer tree (realistic flow) or local TicketSystem (legacy demo).
app.post("/api/record-nullifier", (req: Request, res: Response) => {
    const { secret, issuedAt } = req.body as { secret?: string; issuedAt?: number; nullifier?: string };
    // Explicitly reject clients that try to send a precomputed nullifier.
    // The server must derive the nullifier from the secret to prevent arbitrary inserts.
    if ((req.body as any).nullifier) {
        return res.status(400).json({ ok: false, reason: "Do not send nullifier; server derives it" });
    }
    if (!secret || !issuedAt) return res.status(400).json({ ok: false, reason: "Missing secret or issuedAt" });
    const onchain = readOnchain();
    // Expiry check if initialized
    if (onchain.maxAgeMs && Date.now() > issuedAt + onchain.maxAgeMs) {
        return res.status(400).json({ ok: false, reason: "Ticket expired" });
    }
    // Determine validation source
    let valid = false;
    let index: number | undefined = undefined;
    const issuer = readIssuerTree();
    if (issuer) {
        const leaf = leafFromTicket(secret, issuedAt);
        index = issuer.leaves.indexOf(leaf);
        if (index >= 0) valid = true;
    } else {
        // Legacy demo: fall back to local TicketSystem records
        const system = TicketSystem.fromLocal();
        if (system) {
            const rec = system.getRecords().find(r => r.secret === secret && r.issuedAt === issuedAt);
            if (rec) { valid = true; index = rec.index; }
        }
    }
    if (!valid) return res.status(404).json({ ok: false, reason: "Ticket not found" });
    const nullifier = nullifierFromSecret(secret);
    onchain.nullifiers = onchain.nullifiers || [];
    if (onchain.nullifiers.includes(nullifier)) {
        return res.status(400).json({ ok: false, reason: "Already used" });
    }
    onchain.nullifiers.push(nullifier);
    writeOnchain(onchain);
    res.json({ ok: true, nullifier, onchain, index });
});

// Paid issuance: verify txId has not been used and accept leaf (demo-level verification)
app.post("/api/paid-issue", (req: Request, res: Response) => {
    const { leaf, txId } = req.body as { leaf: Hash; txId: string };
    if (!leaf) return res.status(400).json({ ok: false, reason: "Missing leaf" });
    if (!txId) return res.status(400).json({ ok: false, reason: "Missing txId" });
    const issuer = readIssuerTree();
    if (!issuer) return res.status(400).json({ ok: false, reason: "Not initialized" });
    // Reject if leaf already exists (duplicate issuance)
    if (issuer.leaves.includes(leaf)) {
        return res.status(409).json({ ok: false, reason: "Leaf already issued" });
    }
    // Enforce Merkle capacity
    const capacity = 1 << issuer.depth;
    if (issuer.leaves.length >= capacity) {
        return res.status(409).json({ ok: false, reason: "Merkle tree is full" });
    }
    // Minimal replay protection: store used txIds
    const payments = readPayments();
    if (payments.usedTxIds.includes(txId)) return res.status(400).json({ ok: false, reason: "Payment already used" });
    // TODO: Integrate indexer verification: ensure txId sends >= price to issuerAddress
    // Only mark txId used once we're sure we're going to accept the leaf
    const leaves = issuer.leaves.slice();
    leaves.push(leaf);
    const tree = new MerkleTree(issuer.depth, leaves);
    writeIssuerTree({ depth: issuer.depth, leaves, maxAgeMs: issuer.maxAgeMs });
    const onchain = readOnchain();
    onchain.root = tree.getRoot();
    onchain.leafCount = leaves.length;
    writeOnchain(onchain);
    payments.usedTxIds.push(txId);
    writePayments(payments);
    res.json({ ok: true, index: leaves.length - 1, onchain });
});

// Friendly landing and health
app.get('/', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    const portInfo = currentPort ? `http://localhost:${currentPort}` : '(starting...)';
    res.send(`<pre>
Ticket demo API is running.

UI dev server:   http://localhost:5173
- Legacy Demo:   http://localhost:5173/demo
- Realistic Flow: http://localhost:5173/real

API base:        ${portInfo}/api
/health          reports actual bound port
</pre>`);
});

let currentPort: number | null = null;
app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, port: currentPort });
});

// Dynamic port selection with graceful fallback if in use
function startServer(preferred: number, attemptsRemaining: number) {
    const port = preferred;
    const server = app.listen(port, () => {
        try {
            const addr = server.address() as any;
            currentPort = (addr && typeof addr.port === 'number') ? addr.port : port;
        } catch { currentPort = port; }
        console.log(`Ticket demo server running on http://localhost:${currentPort}`);
    });
    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            if (attemptsRemaining > 0) {
                const next = port + 1;
                console.warn(`Port ${port} in use; retrying on ${next} (remaining attempts: ${attemptsRemaining})`);
                startServer(next, attemptsRemaining - 1);
            } else {
                console.error(`Failed to bind after multiple attempts starting from ${preferred}`);
                process.exit(1);
            }
        } else {
            console.error('Server error:', err);
            process.exit(1);
        }
    });
}

const INITIAL_PORT = process.env.PORT ? Number(process.env.PORT) : 4001;
startServer(INITIAL_PORT, 10);
