import { useRef, useState, useEffect } from "react";
import { Loader, Trash2 } from "lucide-react";

interface SelectionBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

interface ImageSelectorProps {
  imageUrl: string;
  onSelectionsComplete: (selections: SelectionBox[]) => void;
  isProcessing?: boolean;
}

export function ImageSelector({
  imageUrl,
  onSelectionsComplete,
  isProcessing = false,
}: ImageSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selections, setSelections] = useState<SelectionBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [currentBox, setCurrentBox] = useState<SelectionBox | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);

  // Calculate scale factor for canvas display
  const calculateScale = (img: HTMLImageElement): number => {
    const container = containerRef.current;
    if (!container) return 1;

    const maxWidth = 800; // Max display width
    const maxHeight = 600; // Max display height

    const scaleX = maxWidth / img.width;
    const scaleY = maxHeight / img.height;

    return Math.min(scaleX, scaleY, 1); // Don't scale up, only down
  };

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const calculatedScale = calculateScale(img);
      setScale(calculatedScale);
      setImage(img);
      redrawCanvas(img, selections, null, calculatedScale);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw canvas with selections
  const redrawCanvas = (
    img: HTMLImageElement,
    boxes: SelectionBox[],
    currentDraw: SelectionBox | null,
    displayScale: number = scale,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to scaled dimensions for display
    const displayWidth = Math.round(img.width * displayScale);
    const displayHeight = Math.round(img.height * displayScale);

    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Scale context for drawing
    ctx.scale(displayScale, displayScale);

    // Draw image
    ctx.drawImage(img, 0, 0);

    // Draw existing selections
    boxes.forEach((box, idx) => {
      ctx.strokeStyle = "#3B82F6";
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Draw number label
      ctx.fillStyle = "#3B82F6";
      ctx.fillRect(box.x, box.y - 25, 30, 25);
      ctx.fillStyle = "white";
      ctx.font = "bold 16px Arial";
      ctx.fillText(String(idx + 1), box.x + 8, box.y - 8);
    });

    // Draw current box being drawn
    if (currentDraw && (currentDraw.width !== 0 || currentDraw.height !== 0)) {
      ctx.strokeStyle = "#EF4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        currentDraw.x,
        currentDraw.y,
        currentDraw.width,
        currentDraw.height,
      );
      ctx.setLineDash([]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || isProcessing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Get coordinates in scaled canvas space, then convert to image space
    const scaledX = e.clientX - rect.left;
    const scaledY = e.clientY - rect.top;
    const x = scaledX / scale;
    const y = scaledY / scale;

    setIsDrawing(true);
    setStartX(x);
    setStartY(y);
    setCurrentBox({ id: Date.now().toString(), x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !image || !currentBox) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaledX = e.clientX - rect.left;
    const scaledY = e.clientY - rect.top;
    const x = scaledX / scale;
    const y = scaledY / scale;

    const width = Math.abs(x - startX);
    const height = Math.abs(y - startY);
    const boxX = Math.min(x, startX);
    const boxY = Math.min(y, startY);

    const updatedBox = {
      ...currentBox,
      x: boxX,
      y: boxY,
      width,
      height,
    };

    setCurrentBox(updatedBox);
    redrawCanvas(image, selections, updatedBox, scale);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentBox || !image) return;

    setIsDrawing(false);

    // Only add box if it has significant size
    if (currentBox.width > 10 && currentBox.height > 10) {
      setSelections([...selections, currentBox]);
      redrawCanvas(image, [...selections, currentBox], null, scale);
    }

    setCurrentBox(null);
  };

  const removeSelection = (id: string) => {
    const updated = selections.filter((s) => s.id !== id);
    setSelections(updated);
    if (image) {
      redrawCanvas(image, updated, null, scale);
    }
  };

  const handleComplete = () => {
    onSelectionsComplete(selections);
  };

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="border-2 border-gray-300 rounded overflow-hidden bg-gray-50 inline-block"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="cursor-crosshair block"
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-900">
        <strong>Draw boxes:</strong> Click and drag to draw a box around each
        service/material item. Numbers appear in the top-left of each box.
      </div>

      {selections.length > 0 && (
        <div className="space-y-2">
          <div className="font-semibold text-gray-700">
            Selections: {selections.length}
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {selections.map((sel, idx) => (
              <div
                key={sel.id}
                className="flex items-center justify-between bg-gray-100 p-2 rounded text-sm"
              >
                <span className="font-semibold">Item {idx + 1}</span>
                <button
                  onClick={() => removeSelection(sel.id)}
                  className="text-red-600 hover:text-red-800"
                  disabled={isProcessing}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleComplete}
        disabled={selections.length === 0 || isProcessing}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2 px-4 rounded font-semibold flex items-center justify-center gap-2"
      >
        {isProcessing && <Loader size={16} className="animate-spin" />}
        {isProcessing
          ? "Processing..."
          : `Extract Text from ${selections.length} Item(s)`}
      </button>
    </div>
  );
}
