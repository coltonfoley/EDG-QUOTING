import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Eraser, Pen, Type, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SignatureData {
  type: 'draw' | 'type';
  imageData: string;
  name: string;
}

interface SignatureCanvasProps {
  onSignatureChange: (signature: SignatureData | null) => void;
  signerName?: string;
}

export function SignatureCanvas({ onSignatureChange, signerName = '' }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [typedName, setTypedName] = useState(signerName);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw');
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number; time: number } | null>(null);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#1a365d';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    initCanvas();
    
    const handleResize = () => {
      if (!hasDrawing) {
        initCanvas();
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initCanvas, hasDrawing]);

  const getPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    return { x, y, time: Date.now() };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if ('touches' in e) {
      e.preventDefault();
    }

    const point = getPoint(e);
    if (!point) return;

    setIsDrawing(true);
    setLastPoint(point);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPoint) return;

    if ('touches' in e) {
      e.preventDefault();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const point = getPoint(e);
    if (!point) return;

    const distance = Math.sqrt(
      Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2)
    );
    const timeDelta = point.time - lastPoint.time;
    const speed = timeDelta > 0 ? distance / timeDelta : 0;
    
    const minWidth = 1;
    const maxWidth = 3.5;
    const targetWidth = Math.max(minWidth, maxWidth - speed * 0.15);
    
    ctx.lineWidth = ctx.lineWidth + (targetWidth - ctx.lineWidth) * 0.3;
    
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    
    setLastPoint(point);
    setHasDrawing(true);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setLastPoint(null);
      updateSignatureFromCanvas();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    onSignatureChange(null);
    
    initCanvas();
  };

  const updateSignatureFromCanvas = (forceName?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const imageData = canvas.toDataURL('image/png');
    const isBlank = imageData === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    if (isBlank && !forceName) return;
    
    const nameToUse = forceName !== undefined ? forceName : typedName;
    if (!isBlank || hasDrawing) {
      onSignatureChange({
        type: 'draw',
        imageData,
        name: nameToUse || 'Drawn Signature'
      });
    }
  };

  useEffect(() => {
    if (signatureMode === 'draw' && hasDrawing && typedName) {
      updateSignatureFromCanvas(typedName);
    }
  }, [typedName]);

  const handleTypedNameChange = (value: string) => {
    setTypedName(value);
    
    if (value.trim()) {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 150;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1a365d';
        ctx.font = '52px "Dancing Script", cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value, canvas.width / 2, canvas.height / 2);
        
        onSignatureChange({
          type: 'type',
          imageData: canvas.toDataURL('image/png'),
          name: value
        });
      }
    } else {
      onSignatureChange(null);
    }
  };

  const handleModeChange = (value: string) => {
    const newMode = value as 'draw' | 'type';
    if (newMode === signatureMode) return;
    
    setSignatureMode(newMode);
    onSignatureChange(null);
    
    if (newMode === 'draw') {
      setHasDrawing(false);
      setTimeout(() => {
        initCanvas();
      }, 0);
    } else {
      setTypedName('');
    }
  };

  const hasSignature = signatureMode === 'draw' ? hasDrawing : typedName.trim().length > 0;

  return (
    <div className="space-y-4">
      <Tabs value={signatureMode} onValueChange={handleModeChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <TabsTrigger 
            value="draw" 
            data-testid="tab-draw-signature"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all"
          >
            <Pen className="w-4 h-4" />
            <span className="font-medium">Draw</span>
          </TabsTrigger>
          <TabsTrigger 
            value="type" 
            data-testid="tab-type-signature"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all"
          >
            <Type className="w-4 h-4" />
            <span className="font-medium">Type</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="space-y-4 mt-4">
          <div className="relative">
            <div className="relative bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 shadow-inner overflow-hidden">
              <canvas
                ref={canvasRef}
                data-testid="signature-canvas"
                className="w-full h-44 sm:h-36 cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <div className="absolute bottom-6 left-6 right-6 border-b-2 border-dashed border-slate-300 dark:border-slate-600 pointer-events-none" />
              <div className="absolute bottom-2 left-6 text-xs text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                Sign above the line
              </div>
              {!hasDrawing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 mb-1">
                    <Pen className="w-5 h-5" />
                    <span className="text-sm font-medium">Sign here</span>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Use your mouse or finger to draw
                  </span>
                </div>
              )}
              {hasDrawing && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full text-xs font-medium">
                  <Check className="w-3 h-3" />
                  Signed
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={clearCanvas}
                data-testid="button-clear-signature"
                disabled={!hasDrawing}
                className="gap-2"
              >
                <Eraser className="w-4 h-4" />
                Clear
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signer-name-draw" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Your Full Name (for records)
            </Label>
            <Input
              id="signer-name-draw"
              data-testid="input-signer-name-draw"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Enter your full name"
              className="h-11"
            />
          </div>
        </TabsContent>

        <TabsContent value="type" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="typed-signature" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Type Your Full Name
            </Label>
            <Input
              id="typed-signature"
              data-testid="input-typed-signature"
              value={typedName}
              onChange={(e) => handleTypedNameChange(e.target.value)}
              placeholder="Enter your full name"
              className="h-12 text-lg"
            />
          </div>
          <div className={cn(
            "relative bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 rounded-xl border-2 shadow-inner overflow-hidden transition-all duration-200",
            typedName ? "border-slate-200 dark:border-slate-700" : "border-dashed border-slate-300 dark:border-slate-600"
          )}>
            <div className="h-32 flex items-center justify-center px-6">
              {typedName ? (
                <div 
                  className="text-4xl sm:text-5xl text-slate-800 dark:text-slate-200 animate-in fade-in-0 duration-300"
                  style={{ fontFamily: "'Dancing Script', cursive" }}
                >
                  {typedName}
                </div>
              ) : (
                <div className="flex flex-col items-center text-slate-400 dark:text-slate-500">
                  <Type className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-sm">Your signature will appear here</span>
                </div>
              )}
            </div>
            <div className="absolute bottom-6 left-6 right-6 border-b-2 border-dashed border-slate-300 dark:border-slate-600 pointer-events-none" />
            {typedName && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full text-xs font-medium">
                <Check className="w-3 h-3" />
                Signed
              </div>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span className="inline-block w-1 h-1 rounded-full bg-slate-400" />
            Your typed name will serve as your legal electronic signature
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
