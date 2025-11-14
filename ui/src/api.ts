export type OnchainState = { version: number; root: string; maxAgeMs: number; nullifiers: string[]; leafCount: number; depth: number };
export type Ticket = { secret: string; issuedAt: number; index: number };
import { sha256Hex } from './crypto';

const base = '';

export async function getState(): Promise<OnchainState> {
    const res = await fetch(`${base}/api/state`);
    if (!res.ok) throw new Error('failed');
    return res.json();
}

export async function getTickets(): Promise<{ tickets: Ticket[] }> {
    const res = await fetch(`${base}/api/tickets`);
    if (!res.ok) throw new Error('failed');
    return res.json();
}

export async function initSystem(maxAgeHours: number, depth: number): Promise<OnchainState> {
    const res = await fetch(`${base}/api/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxAgeHours, depth }) });
    const ct = res.headers.get('content-type') || '';
    let body: any = null;
    if (ct.includes('application/json')) body = await res.json();
    else body = { ok: false, reason: `Non-JSON response (${res.status})` };
    if (!res.ok || body?.ok === false) throw new Error(body?.reason || 'init failed');
    return body;
}

export async function issueTicket(): Promise<{ ticket: Ticket; onchain: OnchainState }> {
    const res = await fetch(`${base}/api/issue`, { method: 'POST' });
    if (!res.ok) throw new Error('failed');
    return res.json();
}

export async function redeemTicket(secret: string, issuedAt: number): Promise<{ ok: true; nullifier: string; onchain: OnchainState } | { ok: false; reason: string }> {
    const res = await fetch(`${base}/api/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, issuedAt }) });
    const ct = res.headers.get('content-type') || '';
    let body: any = null;
    if (ct.includes('application/json')) {
        body = await res.json();
    } else {
        const text = await res.text();
        body = { ok: false, reason: `Non-JSON response (${res.status}): ${text.slice(0, 100)}` };
    }
    if (!res.ok) {
        return { ok: false, reason: body?.reason || body?.error || `HTTP ${res.status}` };
    }
    // Success path expected to include ok=true
    if (body && body.ok === true) return body;
    // If server responded 200 but without ok flag, treat as error to avoid false success
    return { ok: false, reason: 'Malformed server response' };
}

export async function redeemLeaf(secret: string, issuedAt: number): Promise<{ ok: true; nullifier: string; onchain: OnchainState } | { ok: false; reason: string }> {
    const res = await fetch(`${base}/api/redeem-leaf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, issuedAt }) });
    const ct = res.headers.get('content-type') || '';
    let body: any = null;
    if (ct.includes('application/json')) body = await res.json();
    else body = { ok: false, reason: `Non-JSON response (${res.status})` };
    if (!res.ok) return { ok: false, reason: body?.reason || `HTTP ${res.status}` };
    if (body && body.ok === true) return body;
    return { ok: false, reason: 'Malformed server response' };
}

export async function resetAll(): Promise<{ ok: true }> {
    const attempt = async (method: 'POST' | 'GET') => {
        const res = await fetch(`${base}/api/reset`, { method });
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            const json = await res.json();
            return { ok: res.ok, json };
        } else {
            const text = await res.text();
            return { ok: res.ok, json: { ok: false, reason: `Non-JSON response (${res.status}): ${text.slice(0, 100)}` } };
        }
    };
    let r = await attempt('POST');
    if (!r.ok || !r.json?.ok) {
        r = await attempt('GET');
    }
    if (!r.ok || !r.json?.ok) {
        throw new Error(r.json?.reason || 'reset failed');
    }
    return { ok: true };
}

// Payment-related helpers
export async function getPaymentInfo(): Promise<{ ok: true; issuerAddress: string; priceTdust: number; network: string }> {
    const res = await fetch(`${base}/api/payment-info`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.reason || 'payment info failed');
    return data;
}

export async function paidIssue(secret: string, issuedAt: number, txId: string): Promise<{ ok: true; index: number; onchain: OnchainState }> {
    const leaf = await sha256Hex(`${secret}:${issuedAt}`);
    const res = await fetch(`${base}/api/paid-issue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leaf, txId }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.reason || 'paid issue failed');
    return data;
}
