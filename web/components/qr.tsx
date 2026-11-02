import qrcode from 'qrcode-generator';

/**
 * A QR code drawn as one SVG path. The sign-in service offers its own as a
 * `data:` image, which the workspace's content policy drops, so the code is
 * drawn here from the same otpauth address instead. Black on white, with the
 * quiet zone the scanners expect, whatever the theme.
 */
export function QrCode({ text, label, size = 184 }: { text: string; label: string; size?: number }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
  return (
    <svg className="qr" role="img" aria-label={label} width={size} height={size} viewBox={`-4 -4 ${n + 8} ${n + 8}`} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={n + 8} height={n + 8} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
