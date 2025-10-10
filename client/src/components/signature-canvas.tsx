import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Eraser, Pen } from 'lucide-react';

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Set drawing style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawing(true);

    // Update signature data
    updateSignatureFromCanvas();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
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
  };

  const updateSignatureFromCanvas = (forceName?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if canvas actually has content
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

  // Update signature when name changes in draw mode (only if there's a drawing)
  useEffect(() => {
    if (signatureMode === 'draw' && hasDrawing && typedName) {
      updateSignatureFromCanvas(typedName);
    }
  }, [typedName]);

  const handleTypedNameChange = (value: string) => {
    setTypedName(value);
    
    if (value.trim()) {
      // Create signature image from typed name
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 150;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.font = '48px "Dancing Script", cursive, Arial';
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
    setSignatureMode(value as 'draw' | 'type');
    onSignatureChange(null);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs value={signatureMode} onValueChange={handleModeChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="draw" data-testid="tab-draw-signature">
              <Pen className="w-4 h-4 mr-2" />
              Draw Signature
            </TabsTrigger>
            <TabsTrigger value="type" data-testid="tab-type-signature">
              Type Name
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draw" className="space-y-4">
            <div className="relative">
              <canvas
                ref={canvasRef}
                data-testid="signature-canvas"
                className="w-full h-40 border-2 border-gray-300 rounded-md cursor-crosshair touch-none bg-white"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              {!hasDrawing && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400">
                  Sign here with your mouse or finger
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                type="button"
                variant="outline" 
                onClick={clearCanvas}
                data-testid="button-clear-signature"
                disabled={!hasDrawing}
              >
                <Eraser className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signer-name-draw">Your Name (for records)</Label>
              <Input
                id="signer-name-draw"
                data-testid="input-signer-name-draw"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>
          </TabsContent>

          <TabsContent value="type" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="typed-signature">Type Your Full Name</Label>
              <Input
                id="typed-signature"
                data-testid="input-typed-signature"
                value={typedName}
                onChange={(e) => handleTypedNameChange(e.target.value)}
                placeholder="Enter your full name"
                className="text-lg"
              />
            </div>
            {typedName && (
              <div className="border-2 border-gray-300 rounded-md p-4 bg-white">
                <div 
                  className="text-5xl text-center"
                  style={{ fontFamily: "'Dancing Script', cursive, Arial" }}
                >
                  {typedName}
                </div>
              </div>
            )}
            <p className="text-sm text-gray-500">
              Your typed name will serve as your legal signature
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
