import { MerkleTree, leafFromTicket, nullifierFromSecret, Hash } from "../lib/merkle.js";
import fs from "fs";

export interface TicketRecord {
    secret: string; // randomly generated per ticket
    issuedAt: number; // ms timestamp
    index: number; // position in tree
}

export interface TicketLedgerStateOnChain {
    root: Hash;
    maxAgeMs: number; // validity window from issuedAt (e.g., 24h)
    nullifiers: Hash[]; // used tickets
    leafCount: number;
}

export interface LocalTicketState {
    treeDepth: number;
    tickets: TicketRecord[];
    maxAgeMs: number;
}

const LOCAL_STATE_FILE = ".tickets.local.json";

export class TicketSystem {
    private tree: MerkleTree;
    private records: TicketRecord[] = [];
    readonly depth: number;
    maxAgeMs: number;

    constructor(depth: number, maxAgeMs: number, existing?: TicketRecord[]) {
        this.depth = depth;
        this.maxAgeMs = maxAgeMs;
        if (existing) this.records = existing;
        const leaves = this.records.map(r => leafFromTicket(r.secret, r.issuedAt));
        this.tree = new MerkleTree(depth, leaves);
    }

    issueTicket(): TicketRecord {
        const secret = cryptoRandomHex(32);
        const issuedAt = Date.now();
        const leaf = leafFromTicket(secret, issuedAt);
        this.tree.append(leaf);
        const index = this.tree.getLeafCount() - 1;
        const record: TicketRecord = { secret, issuedAt, index };
        this.records.push(record);
        this.saveLocal();
        return record;
    }

    getRoot(): Hash { return this.tree.getRoot(); }
    getLeafCount(): number { return this.tree.getLeafCount(); }
    getRecords(): TicketRecord[] { return [...this.records]; }

    generateProof(record: TicketRecord) {
        return this.tree.getProof(record.index);
    }

    toOnChainState(nullifiers: Hash[]): TicketLedgerStateOnChain {
        return {
            root: this.getRoot(),
            maxAgeMs: this.maxAgeMs,
            nullifiers,
            leafCount: this.getLeafCount()
        };
    }

    static fromLocal(): TicketSystem | null {
        if (!fs.existsSync(LOCAL_STATE_FILE)) return null;
        const raw = JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, "utf-8"));
        const { treeDepth, tickets, maxAgeMs } = raw as LocalTicketState;
        return new TicketSystem(treeDepth, maxAgeMs, tickets);
    }

    saveLocal() {
        const data: LocalTicketState = {
            treeDepth: this.depth,
            tickets: this.records,
            maxAgeMs: this.maxAgeMs
        };
        fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(data, null, 2));
    }
}

export function cryptoRandomHex(bytes: number): string {
    const b = Buffer.alloc(bytes);
    for (let i = 0; i < bytes; i++) b[i] = Math.floor(Math.random() * 256); // non‑crypto fallback
    return b.toString("hex");
}

export interface RedemptionAttempt {
    secret: string;
    issuedAt: number;
    proof: { siblings: Hash[]; index: number };
    nullifier: Hash;
}

export function verifyRedemption(
    onChain: TicketLedgerStateOnChain,
    attempt: RedemptionAttempt,
    currentTimeMs: number
): { ok: boolean; reason?: string } {
    // Expiry check
    if (currentTimeMs > attempt.issuedAt + onChain.maxAgeMs) {
        return { ok: false, reason: "Ticket expired" };
    }
    // Nullifier uniqueness
    if (onChain.nullifiers.includes(attempt.nullifier)) {
        return { ok: false, reason: "Already used" };
    }
    // Inclusion check
    const leaf = leafFromTicket(attempt.secret, attempt.issuedAt);
    const included = MerkleTree.verify(leaf, attempt.proof, onChain.root);
    if (!included) return { ok: false, reason: "Merkle proof invalid" };
    return { ok: true };
}

export { nullifierFromSecret } from "../lib/merkle.js";
