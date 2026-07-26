import { useRef, useState, useEffect } from 'react';
import { RotateCcw, Check, X } from 'lucide-react';

export default function SignaturePad({
  onSave, onCancel,
}: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Scale for crisp lines on high-DPI screens
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    setHasDrawn(true);
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function save() {
    if (!canvasRef.current || !hasDrawn) return;
    onSave(canvasRef.current.toDataURL('image/png'));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400">Draw your signature below using your mouse, trackpad, or touchscreen.</div>
      <canvas
        ref={canvasRef}
        className="w-full h-40 bg-white border-2 border-dashed border-gray-200 rounded-lg touch-none cursor-crosshair"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex gap-2">
        <button onClick={clear} className="btn-secondary flex items-center gap-2 text-sm"><RotateCcw size={14} /> Clear</button>
        <button onClick={save} disabled={!hasDrawn} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"><Check size={14} /> Save Signature</button>
        <button onClick={onCancel} className="btn-secondary flex items-center gap-2 text-sm"><X size={14} /> Cancel</button>
      </div>
    </div>
  );
}
