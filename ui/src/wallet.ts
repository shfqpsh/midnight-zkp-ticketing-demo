// Minimal browser wallet integration shim for Lace Midnight Preview (or compatible dApp wallets)
// This tries a few common globals and provides a uniform interface for connect, getAddress, and pay.

export type WalletProvider = {
    connect: () => Promise<void>;
    getAddress: () => Promise<string>; // returns 'unknown' if not provided by API
    pay: (to: string, amount: number) => Promise<{ txId: string }>;
    raw?: any; // underlying API for advanced use
    buildAndSubmitPayment?: (to: string, amount: number) => Promise<{ txId: string }>;
};

type AnyWallet = any;

function pickGlobal(): AnyWallet | null {
    const w = window as any;
    // Try a few likely injections
    if (w.midnight) return w.midnight;
    if (w.mnw) return w.mnw;
    if (w.laceMidnight) return w.laceMidnight;
    if (w.mnLace) return w.mnLace;
    // Some wallets might nest under cardano or similar namespaces
    if (w.cardano?.midnight) return w.cardano.midnight;
    if (w.cardano?.mnLace) return w.cardano.mnLace;
    return null;
}

export async function detectWallet(): Promise<WalletProvider | null> {
    let g = pickGlobal();
    // If no global provider, try SDK-based provider
    if (!g) {
        try {
            // Dynamic import to avoid bundling issues if not present
            const sdk: any = await import('@midnight-ntwrk/wallet-api');
            // Heuristic: some SDKs expose a connect/enable that returns an API-like object
            if (sdk) {
                if (typeof sdk.connect === 'function') {
                    g = await sdk.connect({ appName: 'Ticket Demo' }).catch(() => null);
                } else if (typeof sdk.enable === 'function') {
                    g = await sdk.enable({ appName: 'Ticket Demo' }).catch(() => null);
                } else if (typeof sdk.default === 'function') {
                    g = await sdk.default({ appName: 'Ticket Demo' }).catch(() => null);
                } else {
                    // Fallthrough: some SDKs expose a provider directly
                    g = sdk.provider || null;
                }
            }
        } catch {
            // SDK not available or failed; leave g=null so caller can see no wallet
        }
    }
    if (!g) return null;
    // Unwrap common nested provider field
    if (g && typeof g === 'object' && 'mnLace' in g && g.mnLace && typeof g.mnLace === 'object') {
        g = g.mnLace;
    }

    let api: AnyWallet | null = null;

    const ensure = async () => {
        if (api) return api;
        // Common pattern: enable() returns the API
        if (typeof g.enable === 'function') {
            api = await g.enable();
        } else if (typeof g.connect === 'function') {
            api = await g.connect();
        } else {
            // Some wallets expose API directly
            api = g;
        }
        // Some APIs still nest real methods under mnLace after enable/connect
        if (api && typeof api === 'object' && (api as any).mnLace && typeof (api as any).mnLace === 'object') {
            api = (api as any).mnLace;
        }
        return api;
    };

    const provider: WalletProvider = {
        async connect() {
            const a = await ensure();
            try {
                // expose enabled API for debugging
                (provider as any).raw = { pre: g, post: a };
            } catch { /* ignore */ }
        },
        async getAddress() {
            const a = await ensure();
            if (!a) throw new Error('Wallet API unavailable');
            try {
                // Try state() first if available
                if (typeof (a as any).state === 'function') {
                    try {
                        const st = await (a as any).state();
                        const addr = st?.address || st?.account?.address || st?.walletAddress;
                        if (addr && typeof addr === 'string') return addr;
                    } catch { /* ignore */ }
                }
                if (typeof a.getAddress === 'function') return await a.getAddress();
                if (typeof a.getPublicAddress === 'function') return await a.getPublicAddress();
                if (typeof a.address === 'string') return a.address;
                if (typeof a.account?.address === 'string') return a.account.address;
                if (Array.isArray(a.accounts) && a.accounts.length && typeof a.accounts[0].address === 'string') return a.accounts[0].address;
                if (typeof a.getAccounts === 'function') {
                    const acct = await a.getAccounts();
                    if (Array.isArray(acct) && acct.length && typeof acct[0].address === 'string') return acct[0].address;
                }
            } catch { /* swallow and fall through */ }
            // Fallback: unknown address; UI can prompt manual entry
            return 'unknown';
        },
        async pay(to: string, amount: number) {
            const a = await ensure();
            if (!a) throw new Error('Wallet API unavailable');
            // Try a few naming conventions
            if (typeof a.sendPayment === 'function') {
                const r = await a.sendPayment({ to, amount });
                const txId = r?.txId || r?.txid || r?.id || r;
                if (!txId) throw new Error('sendPayment returned no txId');
                return { txId: String(txId) };
            }
            if (typeof a.pay === 'function') {
                const r = await a.pay({ to, amount });
                const txId = r?.txId || r?.txid || r?.id || r;
                if (!txId) throw new Error('pay returned no txId');
                return { txId: String(txId) };
            }
            if (a.transaction && typeof a.transaction.send === 'function') {
                const r = await a.transaction.send({ to, amount });
                const txId = r?.txId || r?.txid || r?.id || r;
                if (!txId) throw new Error('transaction.send returned no txId');
                return { txId: String(txId) };
            }
            // Generic request() fallback (many wallets follow an EIP-1193-like shape)
            if (typeof a.request === 'function') {
                const methods = [
                    'midnight_sendPayment',
                    'wallet_sendPayment',
                    'mn_sendPayment',
                    'midnight_sendTransaction',
                    'wallet_sendTransaction',
                    'mn_sendTransaction',
                    'midnight_pay',
                    'wallet_pay'
                ];
                const paramShapes: any[] = [
                    { to, amount },
                    { recipients: [{ to, amount }] }
                ];
                for (const method of methods) {
                    for (const shape of paramShapes) {
                        try {
                            const r = await a.request({ method, params: [shape] });
                            const txId = r?.txId || r?.txid || r?.id || r;
                            if (txId) return { txId: String(txId) };
                        } catch (_) {
                            // keep trying
                        }
                    }
                }
            }
            // Fallback: attempt generic build + sign + submit if low-level methods exist
            if (typeof a.buildTransaction === 'function' && typeof a.signTransaction === 'function' && typeof a.submitTransaction === 'function') {
                // Assumed shape; may differ for Lace Midnight Preview (needs adaptation if API docs differ)
                const tx = await a.buildTransaction({ outputs: [{ to, amount }] });
                const signed = await a.signTransaction(tx);
                const submitted = await a.submitTransaction(signed);
                const txId = submitted?.txId || submitted?.txid || submitted?.id || submitted;
                if (!txId) throw new Error('submitTransaction returned no txId');
                return { txId: String(txId) };
            }
            // New: Wallet exposes balance*/prove*/submit* primitives
            if (typeof a.balanceAndProveTransaction === 'function' && typeof a.submitTransaction === 'function') {
                const shapes: any[] = [
                    { outputs: [{ to, amount }] },
                    { outputs: [{ address: to, amount }] },
                    { transfers: [{ to, amount }] },
                    { recipients: [{ to, amount }] },
                    { payments: [{ to, amount }] },
                    { to, amount }
                ];
                const errors: string[] = [];
                for (const body of shapes) {
                    try {
                        const proved = await a.balanceAndProveTransaction(body);
                        const submitted = await a.submitTransaction(proved);
                        const txId = submitted?.txId || submitted?.txid || submitted?.id || submitted;
                        if (txId) return { txId: String(txId) };
                    } catch (e: any) {
                        const msg = e?.message || String(e);
                        errors.push(msg.slice(0, 160));
                    }
                }
                throw new Error('balanceAndProveTransaction failed for candidate shapes: ' + errors.join(' | '));
            }
            if (typeof a.balanceTransaction === 'function' && typeof a.proveTransaction === 'function' && typeof a.submitTransaction === 'function') {
                const shapes: any[] = [
                    { outputs: [{ to, amount }] },
                    { outputs: [{ address: to, amount }] },
                    { transfers: [{ to, amount }] },
                    { recipients: [{ to, amount }] },
                    { payments: [{ to, amount }] },
                    { to, amount }
                ];
                const errors: string[] = [];
                for (const body of shapes) {
                    try {
                        const balanced = await a.balanceTransaction(body);
                        const proved = await a.proveTransaction(balanced);
                        const submitted = await a.submitTransaction(proved);
                        const txId = submitted?.txId || submitted?.txid || submitted?.id || submitted;
                        if (txId) return { txId: String(txId) };
                    } catch (e: any) {
                        const msg = e?.message || String(e);
                        errors.push(msg.slice(0, 160));
                    }
                }
                throw new Error('balance+prove+submit failed for candidate shapes: ' + errors.join(' | '));
            }
            throw new Error('Wallet API does not support payment (no sendPayment/pay/transaction.send/request/build-sign-submit)');
        }
    };

    // expose pre-enabled provider by default; will be replaced with { pre, post } after connect()
    (provider as any).raw = g;
    // Expose builder-based path (lazy import) using Midnight SDK if only low-level balance/prove/submit available and direct shapes fail.
    provider.buildAndSubmitPayment = async (to: string, amount: number) => {
        const a = await ensure();
        if (!a) throw new Error('Wallet API unavailable');
        // If direct pay works, use it.
        try {
            return await provider.pay(to, amount);
        } catch { /* fallthrough */ }
        // Attempt SDK draft creation
        try {
            const [{ Transaction: LedgerTx }, { Transaction: ZswapTx }, typesMod] = await Promise.all([
                import('@midnight-ntwrk/ledger'),
                import('@midnight-ntwrk/zswap'),
                import('@midnight-ntwrk/midnight-js-types').catch(() => ({} as any))
            ]);
            // Simplest approach: construct a ledger-level transaction with one output (shielded transfer)
            // NOTE: Without official docs, we attempt a generic builder from createBalancedTx if present.
            if (typesMod.createBalancedTx) {
                // createBalancedTx usually expects a fully balanced ledger tx; we can't produce that pre-balance.
                // We'll instead craft a minimal pseudo object for balanceTransaction.
            }
            // Heuristic minimal draft: { outputs: [{ address: to, amount }] }
            const draft: any = { outputs: [{ address: to, amount }] };
            // Try balance+prove+submit chain
            if (typeof (a as any).balanceAndProveTransaction === 'function' && typeof (a as any).submitTransaction === 'function') {
                const proved = await (a as any).balanceAndProveTransaction(draft);
                const submitted = await (a as any).submitTransaction(proved);
                const txId = submitted?.txId || submitted?.txid || submitted?.id || submitted;
                if (!txId) throw new Error('submitTransaction returned no txId');
                return { txId: String(txId) };
            }
            if (typeof (a as any).balanceTransaction === 'function' && typeof (a as any).proveTransaction === 'function' && typeof (a as any).submitTransaction === 'function') {
                const balanced = await (a as any).balanceTransaction(draft);
                const proved = await (a as any).proveTransaction(balanced);
                const submitted = await (a as any).submitTransaction(proved);
                const txId = submitted?.txId || submitted?.txid || submitted?.id || submitted;
                if (!txId) throw new Error('submitTransaction returned no txId');
                return { txId: String(txId) };
            }
            throw new Error('Builder path unavailable (no balance/prove chain)');
        } catch (e: any) {
            throw new Error('SDK builder failed: ' + (e?.message || String(e)));
        }
    };
    return provider;
}
