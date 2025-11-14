import React, { useEffect, useState } from 'react';
import { detectWallet } from '../wallet';

export default function ConnectWallet() {
    const [addr, setAddr] = useState<string>('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('wallet:address') || '';
        if (saved) setAddr(saved);
    }, []);

    async function connect() {
        setBusy(true);
        try {
            const w = await detectWallet();
            if (!w) { alert('Wallet extension not detected'); return; }
            await w.connect();
            const a = await w.getAddress();
            setAddr(a);
            localStorage.setItem('wallet:address', a);
        } catch (e: any) {
            alert(e?.message || 'Connect failed');
        } finally { setBusy(false); }
    }

    function disconnect() {
        setAddr('');
        localStorage.removeItem('wallet:address');
    }

    if (!addr) {
        return <button className="btn-primary" onClick={connect} disabled={busy}>{busy ? 'Connecting…' : 'Connect Wallet'}</button>;
    }
    const short = addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
    return (
        <div className="addr-wrap" title={addr}>
            <span className="pill addr-pill">{short}</span>
            <button style={{ marginLeft: 8 }} onClick={() => { try { navigator.clipboard.writeText(addr); } catch { } }}>Copy</button>
            <button style={{ marginLeft: 6 }} onClick={disconnect}>Disconnect</button>
        </div>
    );
}
