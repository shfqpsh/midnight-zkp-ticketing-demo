import React, { useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';

export interface TicketQrProps {
    secret: string;
    issuedAt?: number;
    index?: number;
    walletAddress?: string; // used to persist ticket locally per wallet
    style?: React.CSSProperties;
    onSaved?: (record: any) => void; // callback when saved locally
}

// Encodes a compact ticket payload string.
// Format: midnight-ticket:v1:<secret>:<issuedAt>:<index>
function encodeTicket(secret: string, issuedAt?: number, index?: number) {
    if (!secret || !issuedAt || index == null) return '';
    return `midnight-ticket:v1:${secret}:${issuedAt}:${index}`;
}

export const TicketQr: React.FC<TicketQrProps> = ({ secret, issuedAt, index, walletAddress, style, onSaved }) => {
    const payload = encodeTicket(secret, issuedAt, index);
    const [mode, setMode] = useState<'secret' | 'payload' | 'url'>('secret');
    const urlPayload = useMemo(() => {
        if (!payload) return '';
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            // Encode as a URL pointing to the Scanner route and put payload in hash for SPA routing
            // Example: https://host/real/scanner#ticket=<payload>
            return `${origin}/real/scanner#ticket=${encodeURIComponent(payload)}`;
        } catch { return ''; }
    }, [payload]);
    const containerRef = useRef<HTMLDivElement | null>(null);
    function persistLocally() {
        if (!walletAddress || !secret || !issuedAt || index == null) return;
        try {
            const key = `tickets:${walletAddress}`;
            const existing = JSON.parse(localStorage.getItem(key) || '[]') as any[];
            if (!existing.find(r => r.secret === secret && r.index === index)) {
                const record = { secret, issuedAt, index, savedAt: Date.now() };
                existing.push(record);
                localStorage.setItem(key, JSON.stringify(existing));
                if (onSaved) onSaved(record);
            }
        } catch { /* ignore */ }
    }
    const shownValue = mode === 'url' ? (urlPayload || '') : (mode === 'payload' ? (payload || '') : (secret || ''));
    if (!shownValue) {
        // Guidance based on selected mode
        let msg = 'Generate a ticket to see a QR code.';
        if (mode === 'secret') msg = 'Generate a secret to show a QR code.';
        if (mode === 'payload') msg = 'Generate and issue a ticket to show the full payload QR.';
        if (mode === 'url') msg = 'Generate and issue a ticket to show a URL QR.';
        return <div style={{ fontSize: 11, color: '#666' }}>{msg}</div>;
    }
    return (
        <div style={style} ref={containerRef}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#444' }}>QR mode:</span>
                <button onClick={() => setMode('secret')} disabled={mode === 'secret'} style={{ fontSize: 11 }}>Secret only</button>
                <button onClick={() => setMode('payload')} disabled={mode === 'payload'} style={{ fontSize: 11 }}>Payload</button>
                <button onClick={() => setMode('url')} disabled={mode === 'url'} style={{ fontSize: 11 }}>URL</button>
            </div>
            <QRCodeCanvas value={shownValue} size={220} includeMargin={true} level="M" />
            <div style={{ fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>{shownValue}</div>
            {mode === 'url' && (
                <div style={{ fontSize: 11, marginTop: 4, color: '#555' }}>Tip: iPhone Camera prefers URL QR codes. Use URL mode if you want a tap-to-open link.</div>
            )}
            <button style={{ marginTop: 6 }} onClick={() => {
                try {
                    const canvas = containerRef.current?.querySelector('canvas') || document.querySelector('canvas');
                    if (!canvas) return;
                    const url = (canvas as HTMLCanvasElement).toDataURL('image/png');
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ticket-${secret.slice(0, 8)}.png`;
                    a.click();
                    persistLocally(); // also persist when user downloads QR
                } catch { /* ignore */ }
            }}>Download PNG</button>
            <button style={{ marginLeft: 8 }} onClick={async () => {
                try { await navigator.clipboard.writeText(shownValue); } catch { }
                persistLocally(); // persist on copy as well for redundancy
            }}>{mode === 'url' ? 'Copy URL' : mode === 'payload' ? 'Copy Payload' : 'Copy Secret'}</button>
            <button style={{ marginLeft: 8 }} onClick={() => {
                try {
                    const canvas = containerRef.current?.querySelector('canvas') || document.querySelector('canvas');
                    if (!canvas) return;
                    const imgData = (canvas as HTMLCanvasElement).toDataURL('image/png');
                    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
                    const margin = 40;
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    let y = margin;
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(18);
                    pdf.text('Midnight Ticket', margin, y);
                    y += 18 + 8;
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(11);
                    pdf.text(`Secret: ${secret}`, margin, y);
                    y += 14;
                    pdf.text(`IssuedAt: ${issuedAt}`, margin, y);
                    y += 14;
                    pdf.text(`Index: ${index}`, margin, y);
                    y += 20;
                    // Draw QR at right side
                    const qrSize = 220;
                    const x = pageWidth - margin - qrSize;
                    pdf.addImage(imgData, 'PNG', x, margin, qrSize, qrSize);
                    // Also include the payload for backup scan
                    y = margin + qrSize + 20;
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(mode === 'url' ? 'URL:' : mode === 'payload' ? 'Payload:' : 'Secret:', margin, y);
                    y += 14;
                    pdf.setFont('helvetica', 'normal');
                    const split = pdf.splitTextToSize(shownValue, pageWidth - margin * 2);
                    pdf.text(split, margin, y);
                    pdf.save(`ticket-${secret.slice(0, 8)}.pdf`);
                    persistLocally();
                } catch { /* ignore */ }
            }}>Download PDF</button>
        </div>
    );
};

export default TicketQr;
