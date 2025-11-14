import crypto from "crypto";

export type Hash = string; // hex string 0x...

const toHex = (buf: Buffer) => "0x" + buf.toString("hex");

export function sha256Hex(data: Buffer | string): Hash {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return toHex(crypto.createHash("sha256").update(buf).digest());
}

export function hashPair(a: Hash, b: Hash): Hash {
    const aBuf = Buffer.from(a.replace(/^0x/, ""), "hex");
    const bBuf = Buffer.from(b.replace(/^0x/, ""), "hex");
    return sha256Hex(Buffer.concat([aBuf, bBuf]));
}

export function zeroHash(level: number): Hash {
    // Deterministic zero per level
    return sha256Hex(Buffer.from(`ZERO_${level}`));
}

export class MerkleTree {
    readonly depth: number;
    private leaves: Hash[];
    private layers: Hash[][]; // layers[0] = leaves padded, last = root layer

    constructor(depth: number, leaves: Hash[] = []) {
        this.depth = depth;
        const max = 1 << this.depth;
        if (leaves.length > max) {
            throw new Error("Initial leaves exceed tree capacity");
        }
        this.leaves = [...leaves];
        this.layers = [];
        this.rebuild();
    }

    private padLeaves(leaves: Hash[]): Hash[] {
        const size = 1 << this.depth;
        const padded = leaves.slice();
        while (padded.length < size) padded.push(zeroHash(0));
        return padded;
    }

    private rebuild() {
        const base = this.padLeaves(this.leaves);
        const layers: Hash[][] = [base];
        for (let lvl = 0; lvl < this.depth; lvl++) {
            const prev = layers[lvl];
            const next: Hash[] = [];
            for (let i = 0; i < prev.length; i += 2) {
                next.push(hashPair(prev[i], prev[i + 1]));
            }
            layers.push(next);
        }
        this.layers = layers;
    }

    getRoot(): Hash {
        return this.layers[this.layers.length - 1][0];
    }

    getLeafCount(): number {
        return this.leaves.length;
    }

    getLeaves(): Hash[] {
        return [...this.leaves];
    }

    append(leaf: Hash) {
        const max = 1 << this.depth;
        if (this.leaves.length >= max) throw new Error("Merkle tree is full");
        this.leaves.push(leaf);
        this.rebuild();
    }

    getProof(index: number): { siblings: Hash[]; index: number } {
        const size = 1 << this.depth;
        if (index < 0 || index >= size) throw new Error("Index out of range");
        const siblings: Hash[] = [];
        let idx = index;
        for (let lvl = 0; lvl < this.depth; lvl++) {
            const layer = this.layers[lvl];
            const isRight = idx % 2 === 1;
            const siblingIdx = isRight ? idx - 1 : idx + 1;
            siblings.push(layer[siblingIdx]);
            idx = Math.floor(idx / 2);
        }
        return { siblings, index };
    }

    static verify(leaf: Hash, proof: { siblings: Hash[]; index: number }, root: Hash): boolean {
        let h = leaf;
        let idx = proof.index;
        for (let i = 0; i < proof.siblings.length; i++) {
            const sib = proof.siblings[i];
            if (idx % 2 === 0) h = hashPair(h, sib);
            else h = hashPair(sib, h);
            idx = Math.floor(idx / 2);
        }
        return h.toLowerCase() === root.toLowerCase();
    }
}

export function leafFromTicket(secret: string, issuedAtMs: number): Hash {
    return sha256Hex(Buffer.from(`${secret}:${issuedAtMs}`));
}

export function nullifierFromSecret(secret: string): Hash {
    return sha256Hex(Buffer.from(`nullifier:${secret}`));
}
