import React, { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Pencil, Trash2, Save, Square, Circle, LineChart as LineIcon, Grid3X3, Zap, Ruler, Maximize2, Minimize2, Waypoints, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(2);
  const [mode, setMode] = useState<"pencil" | "line" | "rect" | "measure" | "circle" | "delete" | "pan" | "calibrate">("pencil");
  
  // Viewport state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [lastTouchPos, setLastTouchPos] = useState<Point | null>(null);
  const [lastTouchDist, setLastTouchDist] = useState<number | null>(null);

  // Smart features state
  const [gridSize, setGridSize] = useState(20);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [autoStraighten, setAutoStraighten] = useState(true);
  const [snapToEndpoints, setSnapToEndpoints] = useState(true);
  const [isContinuous, setIsContinuous] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [referenceScale, setReferenceScale] = useState(100); // represents total width in unitPrefix

  const containerRef = useRef<HTMLDivElement>(null);

  const undo = () => {
    if (shapes.length === 0) return;
    setRedoStack([shapes, ...redoStack]);
    const newShapes = shapes.slice(0, -1);
    setShapes(newShapes);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const nextShapes = redoStack[0];
    setRedoStack(redoStack.slice(1));
    setShapes(nextShapes);
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
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

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Draw Initial Data (if any)
    if (initialImage) {
      ctx.drawImage(initialImage, 0, 0, canvas.width, canvas.height);
    }

    // Draw Grid
    if (showGrid) {
      ctx.beginPath();
      ctx.strokeStyle = "#f1f5f9";
      ctx.lineWidth = 1 / zoom; // Keep grid lines thin regardless of zoom
      
      // Calculate visible bounds in canvas coordinates
      const left = -panOffset.x / zoom;
      const top = -panOffset.y / zoom;
      const right = (canvas.width - panOffset.x) / zoom;
      const bottom = (canvas.height - panOffset.y) / zoom;

      // Extend grid beyond bounds slightly to ensure full coverage
      const startX = Math.floor(left / gridSize) * gridSize;
      const endX = Math.ceil(right / gridSize) * gridSize;
      const startY = Math.floor(top / gridSize) * gridSize;
      const endY = Math.ceil(bottom / gridSize) * gridSize;

      for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
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
    ctx.restore();
  }, [shapes, currentShape, showGrid, gridSize, referenceScale, unitPrefix, initialImage, zoom, panOffset]);

  useEffect(() => {
    render();
  }, [render]);

  const getPos = (e: React.MouseEvent | React.TouchEvent | PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as any).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as any).clientY;
    
    // Transform screen coordinates back to canvas (zoom/pan aware)
    return { 
      x: (clientX - rect.left - panOffset.x) / zoom, 
      y: (clientY - rect.top - panOffset.y) / zoom 
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e && e.touches.length === 2) {
      // Handle pinch zoom start
      const d = Math.sqrt(
        Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) +
        Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2)
      );
      setLastTouchDist(d);
      setIsDrawing(false);
      return;
    }

    const pos = getPos(e);
    const snappedPos = snapPoint(pos);

    if (mode === "pan") {
      setIsDrawing(true);
      setLastTouchPos(pos);
      return;
    }

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
    setRedoStack([]); // Clear redo stack on new action
    setCurrentShape({
      id: Date.now().toString(),
      type: mode === "calibrate" ? "measure" : mode as any,
      points: [snappedPos],
      color: mode === "calibrate" ? "#f59e0b" : color,
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

    if (mode === "pan" || ("touches" in e && e.touches.length === 2)) {
      if ("touches" in e && e.touches.length === 2) {
        // Pinch zoom
        const d = Math.sqrt(
          Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) +
          Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2)
        );
        if (lastTouchDist) {
          const delta = d / lastTouchDist;
          setZoom(Math.min(Math.max(zoom * delta, 0.1), 10));
        }
        setLastTouchDist(d);
      } else if (lastTouchPos) {
        // Pan
        const currentPos = getPos(e);
        const dx = (currentPos.x - lastTouchPos.x) * zoom;
        const dy = (currentPos.y - lastTouchPos.y) * zoom;
        setPanOffset({ x: panOffset.x + dx, y: panOffset.y + dy });
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
      if (mode === "calibrate" && currentShape.points.length >= 2) {
        const dist = Math.sqrt(
          Math.pow(currentShape.points[1].x - currentShape.points[0].x, 2) +
          Math.pow(currentShape.points[1].y - currentShape.points[0].y, 2)
        );
        const length = prompt(`How long is this line in ${unitPrefix}?`, "1");
        if (length) {
          const l = parseFloat(length);
          if (l > 0) {
            // new referenceScale should satisfy: (dist / canvas_width) * newScale = l
            const newScale = (l * (canvasRef.current?.width || 600)) / dist;
            setReferenceScale(newScale);
          }
        }
        setCurrentShape(null);
        setIsDrawing(false);
        setMode("measure");
        return;
      }

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
    setLastTouchPos(null);
    setLastTouchDist(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(Math.min(Math.max(zoom * delta, 0.1), 10));
      e.preventDefault();
    } else {
      setPanOffset({ x: panOffset.x - e.deltaX, y: panOffset.y - e.deltaY });
    }
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
    <div 
      ref={containerRef} 
      className={cn(
        "flex flex-col gap-2 border rounded-xl p-2 sm:p-3 bg-slate-50/50 shadow-sm overflow-hidden transition-all",
        isFullscreen 
          ? "fixed inset-0 z-[9999] w-screen h-screen bg-slate-50 p-4" 
          : "relative w-full min-h-[500px] lg:min-h-[600px]"
      )}
    >
      {/* Redesigned Primary Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
          {/* Drawing Group */}
          <div className="flex items-center gap-1 pr-1 border-r border-slate-100">
            {[
              { id: "pencil", icon: Pencil, label: "Draw" },
              { id: "line", icon: LineIcon, label: "Line" },
              { id: "rect", icon: Square, label: "Rect" },
              { id: "circle", icon: Circle, label: "Circle" },
            ].map((tool) => (
              <Button
                key={tool.id}
                variant={mode === tool.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode(tool.id as any)}
                className={cn(
                  "flex flex-col items-center gap-0.5 h-11 w-11 px-0 border border-transparent shadow-none",
                  mode === tool.id ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <tool.icon className="w-4 h-4" />
                <span className="text-[8px] font-bold uppercase">{tool.label}</span>
              </Button>
            ))}
          </div>

          {/* Precision Tools Group */}
          <div className="flex items-center gap-1 px-1 border-r border-slate-100">
            {[
              { id: "measure", icon: Ruler, label: "Measure", variant: "measure" },
              { id: "calibrate", icon: Ruler, label: "Calibrate", variant: "calibrate" },
              { id: "pan", icon: Waypoints, label: "Pan", variant: "pan" },
              { id: "delete", icon: Eraser, label: "Erase", variant: "delete" },
            ].map((tool) => (
              <Button
                key={tool.id}
                variant={mode === tool.id ? "default" : "ghost"}
                size="sm"
                onClick={() => { setMode(tool.id as any); setCurrentShape(null); setIsDrawing(false); }}
                className={cn(
                  "flex flex-col items-center gap-0.5 h-11 w-11 px-0 border border-transparent shadow-none",
                  mode === tool.id 
                    ? (tool.id === "calibrate" ? "bg-amber-500 text-white shadow-md" : "bg-indigo-600 text-white shadow-md")
                    : (tool.id === "calibrate" ? "text-amber-600 hover:bg-amber-50" : "text-slate-600 hover:bg-slate-100")
                )}
              >
                <tool.icon className="w-4 h-4" />
                <span className="text-[8px] font-bold uppercase">{tool.label}</span>
              </Button>
            ))}
          </div>

          {/* History Group */}
          <div className="flex items-center gap-1 px-1">
            <Button variant="ghost" size="sm" onClick={undo} disabled={shapes.length === 0} className="flex flex-col items-center gap-0.5 h-11 w-11 px-0 text-slate-600">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-[8px] font-bold uppercase">Undo</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={redo} disabled={redoStack.length === 0} className="flex flex-col items-center gap-0.5 h-11 w-11 px-0 text-slate-600">
              <ArrowLeft className="w-4 h-4 rotate-180" />
              <span className="text-[8px] font-bold uppercase">Redo</span>
            </Button>
          </div>

          <div className="w-[1px] h-8 bg-slate-100 mx-1 hidden sm:block" />

          {/* Settings Group */}
          <div className="flex items-center gap-2 pl-1">
            <div className="flex flex-col items-center gap-1">
              <input 
                type="color" 
                value={color} 
                onChange={(e) => setColor(e.target.value)} 
                disabled={mode === "delete" || mode === "pan" || mode === "calibrate"} 
                className="w-5 h-5 cursor-pointer border rounded-full overflow-hidden p-0 ring-1 ring-slate-200" 
              />
              <span className="text-[8px] font-bold text-slate-400 uppercase leading-none">Color</span>
            </div>
            <div className="flex flex-col gap-0.5">
               <span className="text-[8px] font-bold text-slate-400 uppercase leading-none px-1">Width</span>
               <select value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="border rounded h-6 text-[10px] px-1 bg-slate-50 font-bold text-slate-700 outline-none">
                <option value="1">Thin</option>
                <option value="3">Med</option>
                <option value="6">Thick</option>
              </select>
            </div>
          </div>
        </div>

        {/* View Actions */}
        <div className="flex items-center justify-between lg:justify-end gap-2 bg-white/50 p-1 rounded-lg">
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-indigo-100 shadow-sm">
            <Ruler className="w-3.5 h-3.5 text-indigo-500" />
            <div className="flex flex-col items-start mr-1">
               <span className="text-[7px] font-bold text-indigo-400 uppercase leading-none">Current Scale</span>
               <div className="flex items-center gap-1">
                  <Input 
                    type="number" 
                    value={referenceScale} 
                    onChange={(e) => setReferenceScale(Number(e.target.value))} 
                    className="w-12 h-5 text-[10px] p-0 px-1 font-black bg-transparent border-none focus-visible:ring-0 h-min"
                  />
                  <span className="text-[9px] font-black text-indigo-600 uppercase">{unitPrefix}</span>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={toggleFullscreen} className="h-9 w-9 text-slate-500 bg-white border-slate-200">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 text-xs font-bold gap-2 shadow-lg shadow-indigo-200">
              <Save className="w-4 h-4" /> Save
            </Button>
          </div>
        </div>
      </div>

      {/* Responsive Toggles Bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-1.5 bg-white/30 rounded-lg border border-slate-200/50 backdrop-blur-sm">
          {[
            { id: "grid-toggle", checked: showGrid, onChange: setShowGrid, icon: Grid3X3, label: "Grid" },
            { id: "snap-toggle", checked: snapToGrid, onChange: setSnapToGrid, label: "Snap Grid" },
            { id: "straight-toggle", checked: autoStraighten, onChange: setAutoStraighten, label: "Straighten" },
            { id: "snap-endpoints-toggle", checked: snapToEndpoints, onChange: setSnapToEndpoints, label: "Endpoints" },
            { id: "continuous-toggle", checked: isContinuous, onChange: setIsContinuous, icon: Waypoints, label: "Continuous" },
          ].map((toggle) => (
            <div key={toggle.id} className="flex items-center gap-2">
              <Switch id={toggle.id} checked={toggle.checked} onCheckedChange={toggle.onChange} className="scale-75 origin-left" />
              <Label htmlFor={toggle.id} className="text-[9px] font-bold text-slate-500 flex items-center gap-1 uppercase cursor-pointer hover:text-indigo-600 transition-colors">
                {toggle.icon && <toggle.icon className="w-2.5 h-2.5" />} {toggle.label}
              </Label>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setShapes([])} className="ml-auto h-7 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 uppercase font-black gap-1.5 px-3">
             <Trash2 className="w-3.5 h-3.5" /> Clear All
          </Button>
      </div>

      <div className="relative bg-white border border-slate-200 rounded-xl shadow-inner overflow-hidden cursor-crosshair group flex-1 min-h-[300px]">
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
          onWheel={handleWheel}
          className="bg-transparent touch-none selection:bg-transparent"
        />
        {!isDrawing && shapes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300">
             <div className="text-center opacity-10 group-hover:opacity-20 transition-opacity">
                <Grid3X3 className="w-16 h-16 mx-auto mb-3" />
                <p className="text-lg font-black uppercase tracking-[0.2em] text-slate-800">Smart Canvas</p>
                <p className="text-xs font-bold text-slate-500 mt-1">Select a tool to start your technical sketch</p>
             </div>
          </div>
        )}
        
        {/* Floating Zoom Indicator */}
        <div className="absolute bottom-3 right-3 flex flex-col items-center bg-white/80 backdrop-blur-sm border border-slate-200 px-2 py-1.5 rounded-lg shadow-sm pointer-events-none">
           <span className="text-[8px] font-black text-slate-400 uppercase leading-none mb-1">Zoom</span>
           <span className="text-xs font-black text-indigo-600 leading-none">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold px-2 py-1">
         <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" /> Ctrl+Wheel to Zoom</span>
            <span className="flex items-center gap-1"><Waypoints className="w-3 h-3 text-indigo-400" /> Drag to Pan</span>
         </div>
         <p className="uppercase tracking-tighter opacity-70 italic text-right">Drawing: {width} x {height} px</p>
      </div>
    </div>
  );
}
