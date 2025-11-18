import React from 'react';

export default function Footer() {
    return (
        <div style={{ padding: '20px 0', marginTop: 30, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="container" style={{ color: 'var(--muted)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>© {new Date().getFullYear()} EventStack X Rare Network · Testnet</div>
                <div className="pill">Experimental demo</div>
            </div>
        </div>
    );
}
