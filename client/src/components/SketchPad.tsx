import React, { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Pencil, Trash2, Save, Square, Circle, LineChart as LineIcon, Grid3X3, Zap, Ruler, Maximize2, Minimize2, Waypoints } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Point {
  x: number;
  y: number;
}

interface Shape {
  id: string;
  type: "pencil" | "line" | "rect" | "measure" | "circle" | "delete";
  points: Point[];
  color: string;
  thickness: number;
}

interface SketchPadProps {
  onSave: (dataUrl: string) => void;
  initialData?: string;
  width?: number;
  height?: number;
  unitPrefix?: string; // "ft" or "mm"
}

export function SketchPad({ onSave, initialData, width = 600, height = 400, unitPrefix = "ft" }: SketchPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(2);
  const [mode, setMode] = useState<"pencil" | "line" | "rect" | "measure" | "circle" | "delete">("pencil");
  
  // Smart features state
  const [gridSize, setGridSize] = useState(20);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [autoStraighten, setAutoStraighten] = useState(true);
  const [snapToEndpoints, setSnapToEndpoints] = useState(true);
  const [isContinuous, setIsContinuous] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [referenceScale, setReferenceScale] = useState(100); // represents total width

  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const getNearestPoint = useCallback((p: Point): Point => {
    if (!snapToEndpoints) return p;
    const threshold = 10;
    let nearest = p;
    let minDist = threshold;

    shapes.forEach(shape => {
      shape.points.forEach(pt => {
        const d = Math.sqrt(Math.pow(pt.x - p.x, 2) + Math.pow(pt.y - p.y, 2));
        if (d < minDist) {
          minDist = d;
          nearest = pt;
        }
      });
    });
    return nearest;
  }, [shapes, snapToEndpoints]);

  const snapPoint = useCallback((p: Point): Point => {
    if (!snapToGrid) return getNearestPoint(p);
    const gridSnapped = {
      x: Math.round(p.x / gridSize) * gridSize,
      y: Math.round(p.y / gridSize) * gridSize,
    };
    // Prioritize endpoint snapping if very close
    const endpointSnapped = getNearestPoint(p);
    if (endpointSnapped !== p) return endpointSnapped;
    return gridSnapped;
  }, [snapToGrid, gridSize, getNearestPoint]);

  const straightenLine = useCallback((start: Point, end: Point): Point => {
    if (!autoStraighten || (mode !== "line" && mode !== "rect" && mode !== "measure")) return end;
    
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    
    // Snap to horizontal or vertical if close
    if (dx > dy * 2) return { x: end.x, y: start.y }; // Horizontal
    if (dy > dx * 2) return { x: start.x, y: end.y }; // Vertical
    
    // Snap to 45 degrees
    if (Math.abs(dx - dy) < Math.max(dx, dy) * 0.3) {
       const signX = end.x > start.x ? 1 : -1;
       const signY = end.y > start.y ? 1 : -1;
       const mag = Math.max(dx, dy);
       return { x: start.x + mag * signX, y: start.y + mag * signY };
    }
    
    return end;
  }, [autoStraighten, mode]);

  const [initialImage, setInitialImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (initialData) {
      const img = new Image();
      img.onload = () => setInitialImage(img);
      img.src = initialData;
    }
  }, [initialData]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and draw white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Initial Data (if any)
    if (initialImage) {
      ctx.drawImage(initialImage, 0, 0, canvas.width, canvas.height);
    }

    // Draw Grid
    if (showGrid) {
      ctx.beginPath();
      ctx.strokeStyle = "#f1f5f9";
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      }
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();
    }

    const allEndpoints: string[] = [];
    shapes.forEach(s => {
      if (s.points.length > 0) {
        allEndpoints.push(`${s.points[0].x},${s.points[0].y}`);
        allEndpoints.push(`${s.points[s.points.length - 1].x},${s.points[s.points.length - 1].y}`);
      }
    });

    const endpointCounts = allEndpoints.reduce((acc, p) => {
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const drawShape = (s: Shape) => {
      if (s.points.length < 1) return;
      ctx.beginPath();
      ctx.strokeStyle = s.type === "delete" ? "transparent" : (s.type === "measure" ? "#10b981" : s.color);
      ctx.lineWidth = s.thickness;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (s.type === "rect" && s.points.length >= 2) {
        const start = s.points[0];
        const end = s.points[1];
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      } else if (s.type === "circle" && s.points.length >= 2) {
        const start = s.points[0];
        const end = s.points[1];
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        ctx.beginPath();
        ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw measurement
        const realRadius = (radius / canvas.width) * referenceScale;
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#4f46e5";
        ctx.fillText(`R: ${realRadius.toFixed(1)} ${unitPrefix}`, start.x + radius + 5, start.y);
      } else if ((s.type === "line" || s.type === "measure") && s.points.length >= 2) {
        ctx.moveTo(s.points[0].x, s.points[0].y);
        ctx.lineTo(s.points[1].x, s.points[1].y);
        ctx.stroke();
        
        // Draw measurement
        const dist = Math.sqrt(Math.pow(s.points[1].x - s.points[0].x, 2) + Math.pow(s.points[1].y - s.points[0].y, 2));
        const realLen = (dist / canvas.width) * referenceScale;
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = s.type === "measure" ? "#059669" : "#4f46e5";
        ctx.fillText(`${realLen.toFixed(1)} ${unitPrefix}`, (s.points[0].x + s.points[1].x) / 2 + 5, (s.points[0].y + s.points[1].y) / 2 - 5);
        
        if (s.type === "measure") {
           // Draw end ticks for measurement
           const angle = Math.atan2(s.points[1].y - s.points[0].y, s.points[1].x - s.points[0].x);
           const tickLen = 5;
           ctx.save();
           [s.points[0], s.points[1]].forEach(p => {
              ctx.beginPath();
              ctx.moveTo(p.x - Math.sin(angle) * tickLen, p.y + Math.cos(angle) * tickLen);
              ctx.lineTo(p.x + Math.sin(angle) * tickLen, p.y - Math.cos(angle) * tickLen);
              ctx.stroke();
           });
           ctx.restore();
        }
      } else {
        ctx.moveTo(s.points[0].x, s.points[0].y);
        s.points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      }

      // Draw endpoint indicators (dots)
      if (s.points.length > 0 && s.type !== "delete") {
        ctx.fillStyle = s.type === "measure" ? "#10b981" : "#4f46e5";
        [s.points[0], s.points[s.points.length - 1]].forEach(p => {
          const endpointKey = `${p.x},${p.y}`;
          const count = endpointCounts[endpointKey] || 0;
          
          // If continuous is OFF, always show dots at endpoints
          // If continuous is ON, only show dots at "free" ends (count === 1)
          if (count >= 1 && (!isContinuous || count === 1)) {
             ctx.beginPath();
             ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
             ctx.fill();
          }
        });
      }
    };

    shapes.forEach(drawShape);
    if (currentShape) drawShape(currentShape);
  }, [shapes, currentShape, showGrid, gridSize, referenceScale, unitPrefix, initialImage]);

  useEffect(() => {
    render();
  }, [render]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    const snappedPos = snapPoint(pos);

    if (mode === "delete") {
      // Find and remove the nearest shape
      const threshold = 15; // Increased threshold
      const newShapes = shapes.filter(s => {
        if ((s.type === "line" || s.type === "measure") && s.points.length >= 2) {
          const [p1, p2] = s.points;
          return getPointToSegmentDist(pos, p1, p2) > threshold;
        } else if (s.type === "circle" && s.points.length >= 2) {
          const center = s.points[0];
          const edge = s.points[1];
          const radius = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));
          const dist = Math.sqrt(Math.pow(pos.x - center.x, 2) + Math.pow(pos.y - center.y, 2));
          return Math.abs(dist - radius) > threshold;
        } else if (s.type === "rect" && s.points.length >= 2) {
          const [p1, p2] = s.points;
          const minX = Math.min(p1.x, p2.x);
          const maxX = Math.max(p1.x, p2.x);
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          const inX = pos.x >= minX - 5 && pos.x <= maxX + 5;
          const inY = pos.y >= minY - 5 && pos.y <= maxY + 5;
          const onEdge = (Math.abs(pos.x - p1.x) < 10 || Math.abs(pos.x - p2.x) < 10 || Math.abs(pos.y - p1.y) < 10 || Math.abs(pos.y - p2.y) < 10);
          return !(inX && inY && onEdge);
        } else if (s.type === "pencil") {
          return !s.points.some(p => Math.sqrt(Math.pow(p.x - pos.x, 2) + Math.pow(p.y - pos.y, 2)) < threshold);
        }
        return true; 
      });
      if (newShapes.length !== shapes.length) {
        setShapes(newShapes);
      }
      setIsDrawing(true); // Allow drag-delete
      return;
    }

    if (isContinuous && currentShape && (mode === "line" || mode === "measure")) {
      const lastPt = currentShape.points[currentShape.points.length - 1];
      const dist = Math.sqrt(Math.pow(snappedPos.x - lastPt.x, 2) + Math.pow(snappedPos.y - lastPt.y, 2));
      if (dist < 5) {
        // Stop chain
        setIsDrawing(false);
        setCurrentShape(null);
        return;
      }
      // Continue chain
      setCurrentShape({
        ...currentShape,
        id: Date.now().toString(),
        points: [lastPt, snappedPos]
      });
      setIsDrawing(true);
      return;
    }

    setIsDrawing(true);
    setCurrentShape({
      id: Date.now().toString(),
      type: mode as any,
      points: [snappedPos],
      color: color,
      thickness: lineWidth,
    });
  };

  const getPointToSegmentDist = (p: Point, a: Point, b: Point) => {
    if (!a || !b || !p) return 999999; 
    const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - a.x, 2) + Math.pow(p.y - a.y, 2));
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(Math.pow(p.x - (a.x + t * (b.x - a.x)), 2) + Math.pow(p.y - (a.y + t * (b.y - a.y)), 2));
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pos = getPos(e);

    if (mode === "delete") {
      const threshold = 15;
      const newShapes = shapes.filter(s => {
        if ((s.type === "line" || s.type === "measure") && s.points.length >= 2) {
          const [p1, p2] = s.points;
          return getPointToSegmentDist(pos, p1, p2) > threshold;
        } else if (s.type === "circle" && s.points.length >= 2) {
          const center = s.points[0];
          const radius = Math.sqrt(Math.pow(s.points[1].x - center.x, 2) + Math.pow(s.points[1].y - center.y, 2));
          const dist = Math.sqrt(Math.pow(pos.x - center.x, 2) + Math.pow(pos.y - center.y, 2));
          return Math.abs(dist - radius) > threshold;
        } else if (s.type === "rect" && s.points.length >= 2) {
          const [p1, p2] = s.points;
          const inX = pos.x >= Math.min(p1.x, p2.x) - 5 && pos.x <= Math.max(p1.x, p2.x) + 5;
          const inY = pos.y >= Math.min(p1.y, p2.y) - 5 && pos.y <= Math.max(p1.y, p2.y) + 5;
          const onEdge = (Math.abs(pos.x - p1.x) < 10 || Math.abs(pos.x - p2.x) < 10 || Math.abs(pos.y - p1.y) < 10 || Math.abs(pos.y - p2.y) < 10);
          return !(inX && inY && onEdge);
        } else if (s.type === "pencil") {
          return !s.points.some(p => Math.sqrt(Math.pow(p.x - pos.x, 2) + Math.pow(p.y - pos.y, 2)) < threshold);
        }
        return true;
      });
      if (newShapes.length !== shapes.length) {
        setShapes(newShapes);
      }
      return;
    }

    if (!currentShape) return;
    
    if (mode === "line" || mode === "rect" || mode === "measure" || mode === "circle") {
       const start = currentShape.points[0];
       const snappedPos = snapPoint(pos);
       const correctedPos = mode === "circle" ? snappedPos : straightenLine(start, snappedPos);
       setCurrentShape({ ...currentShape, points: [start, correctedPos] });
    } else {
       setCurrentShape({ ...currentShape, points: [...currentShape.points, pos] });
    }
  };

  const stopDrawing = () => {
    if (isDrawing && currentShape) {
      const newShapes = [...shapes, currentShape];
      setShapes(newShapes);
      
      if (isContinuous && (mode === "line" || mode === "measure")) {
         // Auto-start next line from last endpoint
         const lastPt = currentShape.points[currentShape.points.length - 1];
         setCurrentShape({
            id: (Date.now() + 1).toString(),
            type: mode,
            points: [lastPt],
            color: color,
            thickness: lineWidth
         });
         return; // Keep isDrawing true
      }
    }
    setIsDrawing(false);
    setCurrentShape(null);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const prevGrid = showGrid;
      setShowGrid(false);
      const ctx = canvas.getContext("2d");
      if (ctx) {
         ctx.fillStyle = "#ffffff";
         ctx.fillRect(0, 0, canvas.width, canvas.height);
         const drawShapeLocal = (s: Shape) => {
            if (s.points.length < 1 || s.type === "delete") return;
            ctx.beginPath();
            ctx.strokeStyle = s.color;
            ctx.lineWidth = s.thickness;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            if (s.type === "rect" && s.points.length >= 2) {
              ctx.strokeRect(s.points[0].x, s.points[0].y, s.points[1].x - s.points[0].x, s.points[1].y - s.points[0].y);
            } else if (s.type === "circle" && s.points.length >= 2) {
              const radius = Math.sqrt(Math.pow(s.points[1].x - s.points[0].x, 2) + Math.pow(s.points[1].y - s.points[0].y, 2));
              ctx.arc(s.points[0].x, s.points[0].y, radius, 0, Math.PI * 2);
              ctx.stroke();
            } else if (s.type === "line" || s.type === "measure") {
              ctx.moveTo(s.points[0].x, s.points[0].y);
              ctx.lineTo(s.points[1].x, s.points[1].y);
              ctx.stroke();
            } else {
              ctx.moveTo(s.points[0].x, s.points[0].y);
              s.points.forEach(p => ctx.lineTo(p.x, p.y));
              ctx.stroke();
            }
         };
         shapes.forEach(drawShapeLocal);
         onSave(canvas.toDataURL("image/png"));
      }
      setShowGrid(prevGrid);
    }
  };

  return (
    <div ref={containerRef} className={`flex flex-col gap-3 border rounded-lg p-2 sm:p-4 bg-slate-50 shadow-sm overflow-hidden ${isFullscreen ? 'fixed inset-0 z-[9999] w-screen h-screen' : ''}`}>
      {/* Primary Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-2 rounded border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant={mode === "pencil" ? "default" : "outline"} size="icon" onClick={() => setMode("pencil")} title="Pencil" className="h-8 w-8">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant={mode === "line" ? "default" : "outline"} size="icon" onClick={() => setMode("line")} title="Line" className="h-8 w-8">
            <LineIcon className="w-4 h-4" />
          </Button>
          <Button variant={mode === "rect" ? "default" : "outline"} size="icon" onClick={() => setMode("rect")} title="Rectangle" className="h-8 w-8">
            <Square className="w-4 h-4" />
          </Button>
          <Button variant={mode === "circle" ? "default" : "outline"} size="icon" onClick={() => setMode("circle")} title="Circle" className="h-8 w-8">
            <Circle className="w-4 h-4" />
          </Button>
          <Button variant={mode === "measure" ? "default" : "outline"} size="icon" onClick={() => { setMode("measure"); setCurrentShape(null); setIsDrawing(false); }} title="Measure" className="h-8 w-8">
            <Ruler className="w-4 h-4" />
          </Button>
          <Button variant={mode === "delete" ? "default" : "outline"} size="icon" onClick={() => { setMode("delete"); setCurrentShape(null); setIsDrawing(false); }} title="Delete Shape" className="h-8 w-8">
            <Eraser className="w-4 h-4" />
          </Button>
          <div className="w-[1px] h-6 bg-slate-200 mx-1" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={mode === "delete"} className="w-7 h-7 cursor-pointer border-none p-0 bg-transparent" />
          <select value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="border rounded h-7 text-xs px-1 bg-slate-50">
            <option value="1">Thin</option>
            <option value="3">Med</option>
            <option value="6">Thick</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border">
            <Ruler className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase">Scale:</span>
            <Input 
              type="number" 
              value={referenceScale} 
              onChange={(e) => setReferenceScale(Number(e.target.value))} 
              className="w-16 h-6 text-[10px] p-1 font-bold"
            />
            <span className="text-[10px] font-bold text-slate-600 uppercase">{unitPrefix}</span>
          </div>
          <Button variant="outline" size="icon" onClick={toggleFullscreen} title="Fullscreen" className="h-8 w-8 text-slate-500">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button size="sm" onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs font-bold gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Save Sketch
          </Button>
        </div>
      </div>

      {/* Toggles Bar */}
      <div className="flex flex-wrap items-center gap-4 px-2 py-1">
          <div className="flex items-center gap-2">
            <Switch id="grid-toggle" checked={showGrid} onCheckedChange={setShowGrid} />
            <Label htmlFor="grid-toggle" className="text-[10px] font-bold text-slate-500 flex items-center gap-1 uppercase cursor-pointer">
               <Grid3X3 className="w-3 h-3" /> Grid
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="snap-toggle" checked={snapToGrid} onCheckedChange={setSnapToGrid} />
            <Label htmlFor="snap-toggle" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer">Snap to Grid</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="straight-toggle" checked={autoStraighten} onCheckedChange={setAutoStraighten} />
            <Label htmlFor="straight-toggle" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer">Auto-Straighten</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="snap-endpoints-toggle" checked={snapToEndpoints} onCheckedChange={setSnapToEndpoints} />
            <Label htmlFor="snap-endpoints-toggle" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer">Snap to Endpoints</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="continuous-toggle" checked={isContinuous} onCheckedChange={setIsContinuous} />
            <Label htmlFor="continuous-toggle" className="text-[10px] font-bold text-slate-500 flex items-center gap-1 uppercase cursor-pointer">
               <Waypoints className="w-3 h-3" /> Continuous
            </Label>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShapes([])} className="ml-auto h-6 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 uppercase font-bold gap-1">
             <Trash2 className="w-3 h-3" /> Clear
          </Button>
      </div>

      <div className="relative bg-white border rounded shadow-inner overflow-auto cursor-crosshair group">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="bg-transparent touch-none"
        />
        {!isDrawing && shapes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
             <div className="text-center">
                <Grid3X3 className="w-12 h-12 mx-auto mb-2" />
                <p className="text-sm font-bold uppercase tracking-widest text-slate-800">Smart Draw Area</p>
                <p className="text-[10px] font-medium text-slate-500">Pick a tool and start sketching with scale assistance</p>
             </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium px-1">
         <p>Tip: Hold Shift for freehand even in line mode (coming soon).</p>
         <p>Resolution: {width} x {height}</p>
      </div>
    </div>
  );
}
