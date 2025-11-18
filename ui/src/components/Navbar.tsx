import React from 'react';
import { Link } from 'react-router-dom';
import ConnectWallet from './ConnectWallet';

export default function Navbar() {
    return (
        <div className="navbar">
            <div className="navbar-inner">
                <div className="brand brand-image">
                    <Link to="/real" aria-label="EventStack × Rare Network">
                        <img src="/eventstack-rare.png" alt="EventStack × Rare Network" className="brand-logo" />
                    </Link>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="nav-links">
                        <Link className="nav-link" to="/real">Home</Link>
                        <Link className="nav-link" to="/real/issuer">Issuer</Link>
                        <Link className="nav-link" to="/real/wallet">Wallet</Link>
                        <Link className="nav-link" to="/real/scanner">Scanner</Link>
                        <span className="pill"><Link to="/demo">Legacy Demo</Link></span>
                    </div>
                    <ConnectWallet />
                </div>
            </div>
        </div>
    );
}
