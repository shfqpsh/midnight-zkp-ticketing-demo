import React, { useEffect, useMemo, useState } from 'react';
import { siCardano, siEthereum, siCoinbase } from 'simple-icons';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { getState, initSystem, issueTicket, getTickets, redeemTicket, resetAll, type Ticket, type OnchainState } from './api';
import { ToastProvider, useToast } from './components/ToastProvider';

const Box: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="card">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
    </div>
);

function DemoPage() {
    const [state, setState] = useState<OnchainState | null>(null);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [initHours, setInitHours] = useState(24);
    const [initDepth, setInitDepth] = useState(16);
    const [redeemSecret, setRedeemSecret] = useState('');
    const [redeemIssuedAt, setRedeemIssuedAt] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const { success, error } = useToast();

    async function refresh() {
        setErr(null);
        try {
            const [s, t] = await Promise.all([getState(), getTickets()]);
            setState(s);
            setTickets(t.tickets);
        } catch (e: any) { setErr(e.message || 'Failed to load'); }
    }

    useEffect(() => { refresh(); }, []);

    const canInit = useMemo(() => initHours > 0 && initDepth > 0, [initHours, initDepth]);

    return (
        <div className="container">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                Ticketing Demo
                <span className="pill" style={{ background: '#3b1a1a', borderColor: '#ef4444', color: '#fecaca' }}>Developer Demo Only</span>
            </h1>
            <p className="muted">Issue anonymous, single-use, time-limited tickets with Merkle roots and nullifiers.</p>

            <div className="callout" style={{ borderColor: '#ef4444', marginTop: 8, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: '#fecaca' }}>Developer Demo Only</div>
                <div className="muted" style={{ marginTop: 6 }}>
                    This page intentionally shows secrets and local state for illustration. In the real flow, customers generate secrets in their browser and the issuer only sees hashed commitments (leaves), roots, and nullifiers. Use the Wallet and Scanner pages for the actual customer experience.
                </div>
            </div>

            <div style={{ marginBottom: 12 }}>
                <button className="btn-danger" onClick={async () => {
                    setLoading(true); setErr(null); setMessage(null);
                    try { await resetAll(); await refresh(); setMessage('Reset complete'); }
                    catch (e: any) { setErr(e.message || 'reset failed'); }
                    finally { setLoading(false); }
                }}>Reset (clear issued tickets)</button>
            </div>

            {err && <div className="card" style={{ borderColor: 'rgba(239,68,68,0.6)' }}>Error: {err}</div>}
            {message && <div className="card" style={{ borderColor: 'rgba(34,197,94,0.5)' }}>{message}</div>}

            <Box title="1) Initialize">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <label>Max age (hours)
                        <input type="number" value={initHours} onChange={e => setInitHours(Number(e.target.value))} style={{ marginLeft: 8, width: 120 }} />
                    </label>
                    <label>Merkle depth
                        <input type="number" value={initDepth} onChange={e => setInitDepth(Number(e.target.value))} style={{ marginLeft: 8, width: 120 }} />
                    </label>
                    <button className="btn-primary" disabled={!canInit || loading} onClick={async () => {
                        setLoading(true); setMessage(null);
                        try { await initSystem(initHours, initDepth); await refresh(); setMessage('Initialized'); }
                        catch (e: any) { setErr(e.message || 'init failed'); }
                        finally { setLoading(false); }
                    }}>Initialize</button>
                </div>
            </Box>

            <Box title="2) Issue">
                <button className="btn-primary" disabled={loading} onClick={async () => {
                    setLoading(true); setMessage(null);
                    try { await issueTicket(); await refresh(); setMessage('Issued 1 ticket'); }
                    catch (e: any) { setErr(e.message || 'issue failed'); }
                    finally { setLoading(false); }
                }}>Issue Ticket</button>
            </Box>

            <Box title="3) Redeem">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input placeholder="secret" value={redeemSecret} onChange={e => setRedeemSecret(e.target.value)} style={{ flex: '1 1 280px' }} />
                    <input placeholder="issuedAt (ms)" value={redeemIssuedAt} onChange={e => setRedeemIssuedAt(e.target.value)} style={{ width: 200 }} />
                    <button className="btn-primary" disabled={loading || !redeemSecret || !redeemIssuedAt} onClick={async () => {
                        setLoading(true); setMessage(null);
                        try {
                            const res = await redeemTicket(redeemSecret, Number(redeemIssuedAt));
                            if ((res as any).ok === false) setErr((res as any).reason || 'redeem failed');
                            else { await refresh(); setMessage('Redeemed successfully'); }
                        } catch (e: any) { setErr(e.message || 'redeem failed'); }
                        finally { setLoading(false); }
                    }}>Redeem</button>
                </div>
            </Box>

            <Box title="On-chain State (demo)">
                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(state, null, 2)}</pre>
            </Box>

            <Box title="Issued Tickets (local — developer demo)">
                {tickets.length === 0 ? <div>No tickets yet</div> : (
                    <table>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left' }}>Index</th>
                                <th style={{ textAlign: 'left' }}>Secret</th>
                                <th style={{ textAlign: 'left' }}>IssuedAt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.map(t => (
                                <tr key={`${t.secret}-${t.issuedAt}`}>
                                    <td>{t.index}</td>
                                    <td className="mono" style={{ fontSize: 12 }}>{t.secret}</td>
                                    <td>{t.issuedAt}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Box>

            <div className="muted" style={{ fontSize: 12 }}>
                This is a local demo. On-chain interactions can be wired later via your Midnight endpoints.
            </div>
        </div>
    );
}

// --- Realistic pages ---

function Landing() {
    return (
        <div className="container">
            <div className="hero">
                <h1>Anonymous tickets on Midnight</h1>
                <p>Issue, purchase, and redeem single-use tickets using Merkle trees and nullifiers.</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                    <Link to="/real/wallet"><button className="btn-primary">Get a Ticket</button></Link>
                    <Link to="/real/issuer"><button>Issuer Console</button></Link>
                </div>
            </div>
            <div className="grid" style={{ marginTop: 16 }}>
                <div className="card">
                    <div style={{ fontSize: 22, marginBottom: 6 }}>🎟️ Issue</div>
                    <div className="muted">Create tickets with time limits and track Merkle roots server-side.</div>
                </div>
                <div className="card">
                    <div style={{ fontSize: 22, marginBottom: 6 }}>💳 Buy</div>
                    <div className="muted">Pay in tDust to a shielded address. Manual flow supported until wallet builder opens up.</div>
                </div>
                <div className="card">
                    <div style={{ fontSize: 22, marginBottom: 6 }}>✅ Redeem</div>
                    <div className="muted">Use nullifiers to prevent double-spend, all while keeping buyers private.</div>
                </div>
            </div>
            <div className="card" style={{ marginTop: 8 }}>
                <div className="section-title">Shortcuts</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link to="/real/issuer"><button>Issuer</button></Link>
                    <Link to="/real/wallet"><button className="btn-primary">Wallet</button></Link>
                    <Link to="/real/scanner"><button>Scanner</button></Link>
                    <Link to="/demo"><button>Legacy Demo</button></Link>
                </div>
            </div>
        </div>
    );
}

import { sha256Hex } from './crypto';
import { detectWallet } from './wallet';
import TicketQr from './components/TicketQr';

function IssuerPage() {
    const [hours, setHours] = useState(24); const [depth, setDepth] = useState(16); const [state, setState] = useState<OnchainState | null>(null);
    const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
    const { success, error } = useToast();
    async function refresh() { try { setState(await getState()); } catch (e: any) { setErr(e.message); } }
    useEffect(() => { refresh(); }, []);
    // Auto-refresh overview every 3 seconds (pause when tab hidden)
    useEffect(() => {
        const POLL_MS = 3000;
        const id = window.setInterval(() => {
            try {
                if (document.visibilityState !== 'visible') return;
                refresh();
            } catch { /* ignore */ }
        }, POLL_MS);
        return () => window.clearInterval(id);
    }, []);
    useEffect(() => { if (msg) { success(msg); } }, [msg, success]);
    useEffect(() => { if (err) { error(err); } }, [err, error]);
    // Human-friendly projections
    const depthVal = state?.depth ?? depth;
    const capacity = depthVal != null ? (1 << Number(depthVal)) : undefined;
    const sold = state?.leafCount ?? 0;
    const remaining = capacity != null ? Math.max(capacity - sold, 0) : undefined;
    const usedCount = Array.isArray(state?.nullifiers) ? state!.nullifiers.length : 0;
    const maxAgeH = state ? Math.round(state.maxAgeMs / (60 * 60 * 1000)) : hours;
    const rootShort = state?.root ? `${state.root.slice(0, 12)}…${state.root.slice(-8)}` : '—';
    return (
        <div className="container">
            <h2>Issuer</h2>
            {err && <div style={{ color: 'red' }}>{err}</div>}
            {msg && <div style={{ color: 'green' }}>{msg}</div>}
            <div style={{ marginBottom: 12 }}>
                <button className="btn-danger" onClick={async () => { try { await resetAll(); await refresh(); setMsg('Reset complete'); } catch (e: any) { setErr(e.message || 'reset failed'); } }}>Reset (clear issued tickets)</button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="muted" style={{ minWidth: 150 }}>Validity window (hours)</span>
                    <input type="number" value={hours} onChange={e => setHours(Number(e.target.value))} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="muted" style={{ minWidth: 120 }}>Merkle depth (d)</span>
                    <input type="number" value={depth} min={1} max={32} step={1} onChange={e => setDepth(Number(e.target.value))} />
                </label>
                <button className="btn-primary" onClick={async () => { try { await initSystem(hours, depth); await refresh(); setMsg('Initialized'); } catch (e: any) { setErr(e.message) } }}>Initialize</button>
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Tickets capacity preview: 2^d = {isFinite(Number(depth)) && Number(depth) >= 0 ? (1 << Number(depth)) : '—'}
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                Note: depth must be an integer between 1 and 32
            </div>
            {/* Layman-friendly snapshot */}
            <div className="card" style={{ marginTop: 20 }}>
                <div className="section-title">Overview</div>
                <div className="muted" style={{ marginBottom: 8 }}>Plain-English summary of what’s on-chain right now.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <div className="card" style={{ margin: 0 }}>
                        <div style={{ fontSize: 12, color: '#9aa1b1' }}>Tickets capacity</div>
                        <div style={{ fontSize: 20 }}>
                            {capacity != null ? `${capacity}` : '—'}
                            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                                depth = {depthVal} ⇒ 2^{String(depthVal)}
                            </span>
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Maximum number of tickets that can be issued for this batch.</div>
                    </div>
                    <div className="card" style={{ margin: 0 }}>
                        <div style={{ fontSize: 12, color: '#9aa1b1' }}>Sold so far</div>
                        <div style={{ fontSize: 20 }}>{sold}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Total tickets already issued.</div>
                    </div>
                    <div className="card" style={{ margin: 0 }}>
                        <div style={{ fontSize: 12, color: '#9aa1b1' }}>Remaining</div>
                        <div style={{ fontSize: 20 }}>{remaining != null ? remaining : '—'}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Tickets still available to be issued.</div>
                    </div>
                    <div className="card" style={{ margin: 0 }}>
                        <div style={{ fontSize: 12, color: '#9aa1b1' }}>Validity window</div>
                        <div style={{ fontSize: 20 }}>{maxAgeH} hours</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Each ticket is valid for this long from the moment it’s issued.</div>
                    </div>
                    <div className="card" style={{ margin: 0 }}>
                        <div style={{ fontSize: 12, color: '#9aa1b1' }}>Used tickets / Checked-in (nullifiers)</div>
                        <div style={{ fontSize: 20 }}>{usedCount}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Number of tickets that have already been redeemed.</div>
                    </div>
                    <div className="card" style={{ margin: 0 }}>
                        <div style={{ fontSize: 12, color: '#9aa1b1' }}>Batch fingerprint (root)</div>
                        <div className="mono" style={{ fontSize: 13 }}>{rootShort}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A cryptographic fingerprint representing the entire issued set.</div>
                    </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12 }} className="muted">
                    Depth explains capacity: depth d ⇒ 2^d tickets max. Leaf count is how many have been issued. Nullifiers are spent tickets.
                </div>
            </div>

            <h4 style={{ marginTop: 24 }}>Nerd Friendly (raw on-chain state)</h4>
            <div className="card"><pre style={{ margin: 0 }}>{JSON.stringify(state, null, 2)}</pre></div>
            <p><Link to="/real/wallet">Go to Wallet</Link></p>
        </div>
    );
}

function WalletPage() {
    const [secret, setSecret] = useState('');
    const [issuedAt, setIssuedAt] = useState<number | undefined>();
    const [index, setIndex] = useState<number | undefined>();
    const [onchain, setOnchain] = useState<OnchainState | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [walletAddr, setWalletAddr] = useState<string>('');
    const [walletReady, setWalletReady] = useState(false);
    const { success, error } = useToast();
    const [autoPayBusy, setAutoPayBusy] = useState(false);
    const [debugInfo, setDebugInfo] = useState<any | null>(null);
    const [showDebug, setShowDebug] = useState(false);
    const [showWalletMenu, setShowWalletMenu] = useState(false);
    const WalletIcon = ({ kind }: { kind: 'cardano' | 'metamask' | 'base' }) => {
        const ico = kind === 'cardano' ? siCardano : kind === 'metamask' ? siEthereum : siCoinbase;
        return (
            <span
                className="wallet-icon"
                aria-hidden
                title={ico.title}
                style={{ display: 'inline-flex', width: 16, height: 16, marginRight: 8 }}
                dangerouslySetInnerHTML={{ __html: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#${ico.hex}"><path d="${ico.path}"></path></svg>` }}
            />
        );
    };
    const [debugStateJson, setDebugStateJson] = useState<string>('');
    const [serviceUriJson, setServiceUriJson] = useState<string>('');
    const [fnPreview, setFnPreview] = useState<Array<{ name: string; sig: string }>>([]);
    // Feature flag: hide advanced buy/debug section for customers by default.
    // Re-enable via: add ?showBuy=1 to the URL, or set localStorage.setItem('ui:showBuy','1')
    const [showBuySection] = useState<boolean>(() => {
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.get('showBuy') === '1') return true;
            return localStorage.getItem('ui:showBuy') === '1';
        } catch { return false; }
    });
    // Feature flag: one-step flow (default on). Hides explicit "Generate" and
    // auto-generates when user clicks Get Ticket / Buy Ticket.
    const [oneStep, setOneStep] = useState<boolean>(() => {
        try {
            const url = new URL(window.location.href);
            const q = url.searchParams.get('oneStep');
            if (q === '0') return false;
            if (q === '1') return true;
            const ls = localStorage.getItem('ui:oneStep');
            if (ls === '0') return false;
            if (ls === '1') return true;
            return true; // default on
        } catch { return true; }
    });
    const toggleAdvanced = () => {
        const next = !oneStep;
        setOneStep(next);
        try { localStorage.setItem('ui:oneStep', next ? '1' : '0'); } catch { /* ignore */ }
    };
    async function refresh() { try { setOnchain(await getState()); } catch (e: any) { setErr(e.message); } }
    useEffect(() => { refresh(); }, []);
    useEffect(() => { if (msg) { success(msg); } }, [msg, success]);
    useEffect(() => { if (err) { error(err); } }, [err, error]);
    function gen() { const s = crypto.randomUUID().replace(/-/g, ''); setSecret(s); setIssuedAt(Date.now()); }
    // Client-side guard to prevent re-issuing the same leaf from this browser
    const [leafHex, setLeafHex] = useState<string>('');
    const [leafAlreadyIssued, setLeafAlreadyIssued] = useState<boolean>(false);
    useEffect(() => {
        (async () => {
            try {
                if (!secret || !issuedAt) { setLeafHex(''); setLeafAlreadyIssued(false); return; }
                const h = await sha256Hex(`${secret}:${issuedAt}`);
                setLeafHex(h);
                const arr = JSON.parse(localStorage.getItem('issued:leaves') || '[]') as string[];
                setLeafAlreadyIssued(arr.includes(h));
            } catch { setLeafHex(''); setLeafAlreadyIssued(false); }
        })();
    }, [secret, issuedAt]);
    const [txId, setTxId] = useState('');
    const [price, setPrice] = useState<string>('');
    const [issuerAddr, setIssuerAddr] = useState<string>('');
    // Load saved wallet address (from Navbar) if available
    useEffect(() => {
        const saved = localStorage.getItem('wallet:address');
        if (saved) { setWalletAddr(saved); setWalletReady(true); }
    }, []);
    useEffect(() => {
        (async () => {
            try { const r = await fetch('/api/payment-info'); const j = await r.json(); if (j.ok) { setIssuerAddr(j.issuerAddress); setPrice(String(j.priceTdust)); } } catch { }
        })();
    }, []);
    // Attempt wallet detection (do not auto-connect; user must click Connect)
    useEffect(() => {
        (async () => {
            try {
                const w = await detectWallet();
                if (!w) return; // leave walletReady=false until user connects
                // Capture raw keys for debug
                const raw = (w as any).raw || null;
                if (raw) {
                    const keys = Object.getOwnPropertyNames(raw).filter(k => typeof (raw as any)[k] !== 'function');
                    const fns = Object.getOwnPropertyNames(raw).filter(k => typeof (raw as any)[k] === 'function');
                    // Deep introspection for nested mnLace provider (if wrapper exposes only a child object)
                    let nested: any = null;
                    try {
                        const inner = (raw as any).mnLace;
                        if (inner && typeof inner === 'object') {
                            const innerKeys = Object.getOwnPropertyNames(inner).filter(k => typeof (inner as any)[k] !== 'function');
                            const innerFns = Object.getOwnPropertyNames(inner).filter(k => typeof (inner as any)[k] === 'function');
                            nested = { keys: innerKeys, fns: innerFns };
                        }
                    } catch { /* ignore */ }
                    setDebugInfo({ keys, fns, nested });
                }
            } catch { }
        })();
    }, []);
    async function issue() {
        // Use local variables so state updates don't race this function.
        let useSecret = secret;
        let useIssuedAt = issuedAt;
        // Auto-generate if missing when oneStep flow is enabled
        if ((!useSecret || !useIssuedAt) && oneStep) {
            useSecret = crypto.randomUUID().replace(/-/g, '');
            useIssuedAt = Date.now();
            setSecret(useSecret); setIssuedAt(useIssuedAt);
        }
        if (!useSecret || !useIssuedAt) { setErr('Generate first'); return; }
        if (leafAlreadyIssued) { setErr('Leaf already issued'); return; }
        try {
            const leaf = await sha256Hex(`${useSecret}:${useIssuedAt}`);
            const res = await fetch('/api/issue-leaf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leaf }) });
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('application/json')) { const text = await res.text(); throw new Error(`Non-JSON response: ${text.slice(0, 100)}`); }
            const json = await res.json();
            if (!res.ok) { setErr(json.reason || json.error || 'issue failed'); return; }
            setIndex(json.index); setOnchain(json.onchain); setMsg('Leaf issued (store secret privately)');
            try {
                const key = 'issued:leaves';
                const arr = JSON.parse(localStorage.getItem(key) || '[]') as string[];
                if (!arr.includes(leaf)) { arr.push(leaf); localStorage.setItem(key, JSON.stringify(arr)); }
                setLeafAlreadyIssued(true);
            } catch { /* ignore */ }
        } catch (e: any) { setErr(e.message); }
    }
    // Centralized connect handler used by multiple buttons
    async function connectNow() {
        setErr(null); setMsg(null);
        try {
            const w = await detectWallet();
            if (!w) { setErr('Wallet extension not detected'); return; }
            await w.connect();
            const addr = await w.getAddress();
            setWalletAddr(addr); setWalletReady(true);
            try { localStorage.setItem('wallet:address', addr); } catch { }
            setMsg('Wallet connected');
            // After connect, refresh debug info
            const rawWrap = (w as any).raw || null;
            let target = rawWrap;
            if (rawWrap && rawWrap.post) target = rawWrap.post;
            if (target) {
                const keys = Object.getOwnPropertyNames(target).filter(k => typeof (target as any)[k] !== 'function');
                const fns = Object.getOwnPropertyNames(target).filter(k => typeof (target as any)[k] === 'function');
                let nested: any = null;
                try {
                    const inner = (target as any).mnLace;
                    if (inner && typeof inner === 'object') {
                        const innerKeys = Object.getOwnPropertyNames(inner).filter(k => typeof (inner as any)[k] !== 'function');
                        const innerFns = Object.getOwnPropertyNames(inner).filter(k => typeof (inner as any)[k] === 'function');
                        nested = { keys: innerKeys, fns: innerFns };
                    }
                } catch { }
                setDebugInfo({ keys, fns, nested });
            }
        } catch (e: any) { setErr(e.message || 'connect failed'); }
    }

    // Experimental: connect other wallets
    async function connectCardano(walletKey: 'lace' | 'eternl' | 'nami') {
        try {
            setErr(null); setMsg(null);
            const api = (window as any)?.cardano?.[walletKey];
            if (!api || typeof api.enable !== 'function') { setErr(`${walletKey} wallet not detected`); return; }
            await api.enable();
            setWalletReady(true);
            const tag = `cardano:${walletKey}`;
            setWalletAddr(tag);
            try { localStorage.setItem('wallet:address', tag); } catch { }
            setMsg(`Connected ${walletKey} (Cardano) – payments remain Midnight by default`);
        } catch (e: any) { setErr(e?.message || 'connect failed'); }
    }

    async function connectEvm(provider: 'metamask' | 'base') {
        try {
            setErr(null); setMsg(null);
            const eth = (window as any).ethereum;
            if (!eth || typeof eth.request !== 'function') { setErr('EVM provider not detected'); return; }
            const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
            const addr = accounts && accounts[0] ? accounts[0] : 'evm:unknown';
            setWalletAddr(addr);
            setWalletReady(true);
            try { localStorage.setItem('wallet:address', addr); } catch { }
            const name = provider === 'metamask' ? 'MetaMask' : 'Base Wallet';
            setMsg(`Connected ${name} – payments remain Midnight by default`);
        } catch (e: any) { setErr(e?.message || 'connect failed'); }
    }
    return (
        <div className="container">
            <h2>Wallet</h2>
            {err && <div style={{ color: 'red' }}>{err}</div>}
            {msg && <div style={{ color: 'green' }}>{msg}</div>}
            {!walletReady && (
                <div className="card" style={{ marginTop: 8 }}>
                    <div className="section-title">Step 1 — Connect your wallet</div>
                    <div className="muted" style={{ marginBottom: 8 }}>Connect to continue.</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="btn-primary" onClick={connectNow}>Connect Wallet</button>
                        <div className="dropdown">
                            <button className="dropdown-btn" onClick={() => setShowWalletMenu(s => !s)}>Connect other wallets ▾</button>
                            {showWalletMenu && (
                                <div className="dropdown-menu" onMouseLeave={() => setShowWalletMenu(false)}>
                                    <div className="dropdown-item" style={{ fontWeight: 600, opacity: 0.8, cursor: 'default', pointerEvents: 'none' }}>Cardano (CIP-30)</div>
                                    <div className="dropdown-item" onClick={() => { setShowWalletMenu(false); connectCardano('lace'); }}><WalletIcon kind="cardano" /> Lace</div>
                                    <div className="dropdown-item" onClick={() => { setShowWalletMenu(false); connectCardano('eternl'); }}><WalletIcon kind="cardano" /> Eternl</div>
                                    <div className="dropdown-item" onClick={() => { setShowWalletMenu(false); connectCardano('nami'); }}><WalletIcon kind="cardano" /> Nami</div>
                                    <div className="dropdown-item" style={{ fontWeight: 600, marginTop: 6, opacity: 0.8, cursor: 'default', pointerEvents: 'none' }}>EVM</div>
                                    <div className="dropdown-item" onClick={() => { setShowWalletMenu(false); connectEvm('metamask'); }}><WalletIcon kind="metamask" /> MetaMask</div>
                                    <div className="dropdown-item" onClick={() => { setShowWalletMenu(false); connectEvm('base'); }}><WalletIcon kind="base" /> Base Wallet</div>
                                    <div className="dropdown-item" style={{ fontSize: 12, opacity: 0.7, pointerEvents: 'none' }}>Experimental: payments still recorded on Midnight by default</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {walletReady && (
                <>
                    <div className="card" style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div className="section-title">Step 2 — Generate & Issue</div>
                            <button className="pill" onClick={toggleAdvanced} title="Toggle advanced (two‑step) mode">
                                Advanced: {oneStep ? 'Off' : 'On'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {!oneStep && <button className="btn-primary" onClick={gen}>Generate Ticket</button>}
                            <button onClick={issue} disabled={leafAlreadyIssued}>{oneStep ? 'Get Ticket' : 'Buy Ticket'}</button>
                        </div>
                        {oneStep ? (
                            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                                One‑click flow: we generate your private ticket code and issue it.
                            </div>
                        ) : (
                            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                                Generates a one‑time ticket code. Your purchase is recorded when you click “Buy Ticket”.
                            </div>
                        )}
                        <div style={{ marginTop: 12 }}>
                            <strong>Secret:</strong> <code className="mono">{secret || '—'}</code><br />
                            <strong>IssuedAt:</strong> {issuedAt || '—'}<br />
                            <strong>Index:</strong> {index ?? '—'}
                            {leafAlreadyIssued && (
                                <div className="pill" style={{ marginTop: 6 }}>Leaf already issued</div>
                            )}
                            <div style={{ marginTop: 12 }}>
                                <TicketQr secret={secret} issuedAt={issuedAt} index={index} walletAddress={walletAddr} onSaved={(r) => setMsg(`Ticket saved locally for wallet (index ${r.index}).`)} />
                            </div>
                        </div>
                    </div>
                </>
            )}
            {walletReady && showBuySection && (
                <div className="callout" style={{ marginTop: 16 }}>
                    <div><strong>Buy with Lace Midnight Preview</strong></div>
                    <div className="muted" style={{ fontSize: 12 }}>Connect your wallet to buy a ticket. Or pay manually and paste the txId.</div>
                    <div style={{ marginTop: 8 }}>Issuer Address: <code>{issuerAddr || '—'}</code></div>
                    <div>Price (tDust): <code>{price || '10'}</code></div>
                    <div>Wallet Address: <code>{walletAddr || 'not connected'}</code></div>
                    {walletAddr === 'unknown' && <div style={{ fontSize: 12, color: '#ff8a8a' }}>Wallet connected but did not expose an address. You can still proceed to buy; the txId will be captured from the wallet response.</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <button onClick={async () => { try { await navigator.clipboard.writeText(issuerAddr || ''); setMsg('Issuer address copied'); } catch { setErr('Clipboard write failed'); } }}>Copy Issuer Address</button>
                        <button onClick={async () => { try { await navigator.clipboard.writeText(String(price || '10')); setMsg('Price copied'); } catch { setErr('Clipboard write failed'); } }}>Copy Price</button>
                        <button onClick={async () => { try { const t = await navigator.clipboard.readText(); setTxId(t.trim()); setMsg('Pasted txId from clipboard'); } catch { setErr('Clipboard read failed'); } }}>Paste txId from Clipboard</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn-primary" onClick={async () => {
                            setErr(null); setMsg(null);
                            try {
                                const w = await detectWallet();
                                if (!w) { setErr('Wallet extension not detected'); return; }
                                await w.connect();
                                const addr = await w.getAddress();
                                setWalletAddr(addr); setWalletReady(true);
                                try { localStorage.setItem('wallet:address', addr); } catch { }
                                setMsg('Wallet connected');
                                // After connect, refresh debug info
                                const rawWrap = (w as any).raw || null;
                                // rawWrap may be { pre, post }
                                let target = rawWrap;
                                if (rawWrap && rawWrap.post) target = rawWrap.post;
                                if (target) {
                                    const keys = Object.getOwnPropertyNames(target).filter(k => typeof (target as any)[k] !== 'function');
                                    const fns = Object.getOwnPropertyNames(target).filter(k => typeof (target as any)[k] === 'function');
                                    let nested: any = null;
                                    try {
                                        const inner = (target as any).mnLace;
                                        if (inner && typeof inner === 'object') {
                                            const innerKeys = Object.getOwnPropertyNames(inner).filter(k => typeof (inner as any)[k] !== 'function');
                                            const innerFns = Object.getOwnPropertyNames(inner).filter(k => typeof (inner as any)[k] === 'function');
                                            nested = { keys: innerKeys, fns: innerFns };
                                        }
                                    } catch { }
                                    setDebugInfo({ keys, fns, nested });
                                }
                            } catch (e: any) { setErr(e.message || 'connect failed'); }
                        }}>Connect Wallet</button>
                        <button className="btn-primary" disabled={!walletReady || autoPayBusy} onClick={async () => {
                            setErr(null); setMsg(null); setAutoPayBusy(true);
                            // Auto-generate secret if user hasn't clicked Generate
                            let useSecret = secret; let useIssuedAt = issuedAt;
                            if (!useSecret || !useIssuedAt) {
                                useSecret = crypto.randomUUID().replace(/-/g, '');
                                useIssuedAt = Date.now();
                                setSecret(useSecret);
                                setIssuedAt(useIssuedAt);
                            }
                            try {
                                const w = await detectWallet();
                                if (!w) { setErr('Wallet not detected'); setAutoPayBusy(false); return; }
                                if (!issuerAddr) { setErr('Issuer address unavailable'); setAutoPayBusy(false); return; }
                                const amount = Number(price || '10');
                                let payResult: { txId: string } | null = null;
                                try {
                                    payResult = await w.pay(issuerAddr, amount);
                                } catch (e: any) {
                                    // Try builder-based path if available
                                    if (typeof (w as any).buildAndSubmitPayment === 'function') {
                                        payResult = await (w as any).buildAndSubmitPayment(issuerAddr, amount);
                                    } else {
                                        throw e;
                                    }
                                }
                                if (!payResult) throw new Error('Payment did not return a txId');
                                const newTxId = payResult.txId;
                                const leaf = await sha256Hex(`${useSecret}:${useIssuedAt}`);
                                const r = await fetch('/api/paid-issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leaf, txId: newTxId }) });
                                const j = await r.json();
                                if (!j.ok) { setErr(j.reason || 'purchase failed'); }
                                else { setIndex(j.index); setOnchain(j.onchain); setMsg('Ticket purchased and issued'); }
                            } catch (e: any) {
                                // If wallet does not expose a builder, guide manual send
                                const emsg = e?.message || 'purchase failed';
                                if (emsg.includes('serialize') || emsg.includes('does not support payment')) {
                                    setErr('This wallet version did not expose a programmatic payment builder. Please use manual send below and paste the txId.');
                                } else {
                                    setErr(emsg);
                                }
                            }
                            finally { setAutoPayBusy(false); }
                        }}>Buy Ticket with Wallet</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input placeholder="txId" value={txId} onChange={e => setTxId(e.target.value)} style={{ flex: '1 1 320px' }} />
                        <button className="btn-primary" onClick={async () => {
                            if (!secret || !issuedAt) { setErr('Generate first'); return; }
                            try {
                                const leaf = await sha256Hex(`${secret}:${issuedAt}`);
                                const r = await fetch('/api/paid-issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leaf, txId }) });
                                const j = await r.json();
                                if (!j.ok) { setErr(j.reason || 'paid issue failed'); return; }
                                setIndex(j.index); setOnchain(j.onchain); setMsg('Paid issuance completed');
                            } catch (e: any) { setErr(e.message || 'paid issue failed'); }
                        }}>Record Payment (Paste txId)</button>
                    </div>
                    {!walletReady && <div style={{ fontSize: 11, color: '#ff8a8a' }}>Wallet not connected; you can still pay manually and paste the txId.</div>}
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Manual send instructions: In your wallet, send <strong>{price || '10'}</strong> tDust to <code>{issuerAddr || '—'}</code>. After broadcast, copy the transaction ID and paste it above.</div>
                    <div style={{ marginTop: 10 }}>
                        <button onClick={() => setShowDebug(d => !d)}>Toggle Wallet Debug</button>
                        {showDebug && <div className="card" style={{ marginTop: 8, fontSize: 12 }}>
                            <div style={{ fontWeight: 'bold' }}>Wallet API Introspection</div>
                            {!debugInfo && <div>No wallet object detected yet.</div>}
                            {debugInfo && (
                                <>
                                    <div><strong>Functions ({debugInfo.fns.length}):</strong> {debugInfo.fns.join(', ') || '—'}</div>
                                    <div style={{ marginTop: 4 }}><strong>Properties ({debugInfo.keys.length}):</strong> {debugInfo.keys.join(', ') || '—'}</div>
                                    {debugInfo.nested && (
                                        <div style={{ marginTop: 8 }}>
                                            <div><strong>mnLace Nested Functions ({debugInfo.nested.fns.length}):</strong> {debugInfo.nested.fns.join(', ') || '—'}</div>
                                            <div style={{ marginTop: 4 }}><strong>mnLace Nested Properties ({debugInfo.nested.keys.length}):</strong> {debugInfo.nested.keys.join(', ') || '—'}</div>
                                        </div>
                                    )}
                                    <div style={{ marginTop: 6, color: '#555' }}>If no payment function appears (sendPayment/pay/request etc.), share this list so we can map the actual method. Post-enable API is shown (raw.post).</div>
                                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button onClick={async () => {
                                            try {
                                                const w = await detectWallet();
                                                if (!w) { setDebugStateJson('no wallet'); return; }
                                                await w.connect();
                                                const raw = (w as any).raw;
                                                const post = raw?.post || raw;
                                                if (post && typeof post.state === 'function') {
                                                    const st = await post.state();
                                                    setDebugStateJson(JSON.stringify(st, null, 2));
                                                } else {
                                                    setDebugStateJson('state() not available');
                                                }
                                            } catch (e: any) {
                                                setDebugStateJson('error: ' + (e?.message || String(e)));
                                            }
                                        }}>Load wallet.state()</button>
                                        <button onClick={async () => {
                                            try {
                                                const w = await detectWallet();
                                                if (!w) { setServiceUriJson('no wallet'); return; }
                                                await w.connect();
                                                const raw = (w as any).raw;
                                                const pre = raw?.pre || raw;
                                                const post = raw?.post || raw;
                                                let cfg: any = undefined;
                                                const tryGet = async (obj: any) => {
                                                    if (!obj) return undefined;
                                                    const v = obj.serviceUriConfig;
                                                    if (typeof v === 'function') return await v();
                                                    return v;
                                                };
                                                cfg = await tryGet(post) ?? await tryGet(pre);
                                                setServiceUriJson(cfg ? JSON.stringify(cfg, null, 2) : 'serviceUriConfig not available');
                                            } catch (e: any) {
                                                setServiceUriJson('error: ' + (e?.message || String(e)));
                                            }
                                        }}>Load serviceUriConfig</button>
                                        <button onClick={async () => {
                                            try {
                                                const w = await detectWallet();
                                                if (!w) { setFnPreview([]); return; }
                                                await w.connect();
                                                const raw = (w as any).raw;
                                                const post = raw?.post || raw;
                                                if (!post) { setFnPreview([]); return; }
                                                const names = Object.getOwnPropertyNames(post).filter(k => typeof (post as any)[k] === 'function');
                                                const previews = names.map(n => {
                                                    let sig = '';
                                                    try { sig = String(((post as any)[n] as any).toString()).split('\n')[0].slice(0, 140); } catch { sig = '[unavailable]'; }
                                                    return { name: n, sig };
                                                });
                                                setFnPreview(previews);
                                            } catch { setFnPreview([]); }
                                        }}>Show function previews</button>
                                    </div>
                                    {fnPreview.length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontWeight: 'bold' }}>function previews (first line)</div>
                                            <ul style={{ paddingLeft: 18 }}>
                                                {fnPreview.map(fp => (
                                                    <li key={fp.name}><code>{fp.name}</code>: <span className="muted">{fp.sig}</span></li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {debugStateJson && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontWeight: 'bold' }}>wallet.state()</div>
                                            <pre className="pre-wrap">{debugStateJson}</pre>
                                        </div>
                                    )}
                                    {serviceUriJson && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontWeight: 'bold' }}>serviceUriConfig</div>
                                            <pre className="pre-wrap">{serviceUriJson}</pre>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>}
                    </div>
                </div>
            )}
            <p><Link to="/real/scanner">Go to Scanner</Link></p>
        </div>
    );
}

function ScannerPage() {
    const [secret, setSecret] = useState('');
    const [nullifier, setNullifier] = useState('');
    const [onchain, setOnchain] = useState<OnchainState | null>(null);
    const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
    const { success, error } = useToast();
    async function refresh() { try { setOnchain(await getState()); } catch (e: any) { setErr(e.message); } }
    useEffect(() => { refresh(); }, []);
    useEffect(() => { if (msg) { success(msg); } }, [msg, success]);
    useEffect(() => { if (err) { error(err); } }, [err, error]);
    // Auto-load from URL hash/query: #ticket=<payload> or ?ticket=<payload>
    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            let payload: string | null = null;
            if (url.hash && url.hash.startsWith('#ticket=')) {
                payload = decodeURIComponent(url.hash.slice('#ticket='.length));
            }
            if (!payload) {
                const q = url.searchParams.get('ticket');
                if (q) payload = q;
            }
            if (payload && payload.startsWith('midnight-ticket:v1:')) {
                const parts = payload.split(':');
                if (parts.length >= 5) {
                    const s = parts[2];
                    setSecret(s);
                    sha256Hex(`nullifier:${s}`).then(n => setNullifier(n));
                    setMsg('Loaded ticket from QR link');
                }
            }
        } catch { /* ignore */ }
    }, []);
    async function useSecret() {
        try {
            if (!secret) { setErr('Enter secret'); return; }
            const n = await sha256Hex(`nullifier:${secret}`);
            setNullifier(n);
            setMsg('Derived nullifier from secret');
        } catch (e: any) { setErr(e.message); }
    }
    async function record() {
        try {
            const res = await fetch('/api/record-nullifier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nullifier }) });
            const json = await res.json();
            if (!json.ok) { setErr(json.reason || 'fail'); return; }
            setOnchain(json.onchain); setMsg('Nullifier recorded');
        } catch (e: any) { setErr(e.message); }
    }
    return (
        <div className="container">
            <h2>Scanner</h2>
            {err && <div style={{ color: 'red' }}>{err}</div>}
            {msg && <div style={{ color: 'green' }}>{msg}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input style={{ width: '40%' }} placeholder="secret (optional)" value={secret} onChange={e => setSecret(e.target.value)} />
                <button className="btn-primary" onClick={useSecret}>Use secret → nullifier</button>
                <input style={{ width: '40%' }} placeholder="nullifier" value={nullifier} onChange={e => setNullifier(e.target.value)} />
                <button className="btn-primary" onClick={record}>Record Nullifier</button>
            </div>
            <p><Link to="/real/wallet">Back to Wallet</Link></p>
        </div>
    );
}

export default function App() {
    return (
        <ToastProvider>
            <BrowserRouter>
                {/* Global Navbar */}
                <Navbar />
                <div className="main-wrap">
                    <Routes>
                        <Route path="/demo" element={<DemoPage />} />
                        <Route path="/real" element={<Landing />} />
                        <Route path="/real/issuer" element={<IssuerPage />} />
                        <Route path="/real/wallet" element={<WalletPage />} />
                        <Route path="/real/scanner" element={<ScannerPage />} />
                        <Route path="*" element={<Landing />} />
                    </Routes>
                </div>
                <Footer />
            </BrowserRouter>
        </ToastProvider>
    );
}
