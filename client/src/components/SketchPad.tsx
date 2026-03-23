import React, { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Pencil, Trash2, Save, Square, Circle, LineChart as LineIcon, Grid3X3, Zap, Ruler, Maximize2, Minimize2, Waypoints, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Armchair,
  Bed,
  Layout,
  LayoutGrid,
  Maximize,
  RotateCcw,
  Copy,
  ChevronRight,
  Monitor,
  Hand
} from "lucide-react";

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
  showMeasurement?: boolean;
  rotation?: number; // degrees
}

interface Block {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  color: string;
}

const PREDEFINED_BLOCKS = [
  { id: "sofa-1", type: "sofa", label: "1-Seater Sofa", width: 3, height: 3 },
  { id: "sofa-2", type: "sofa", label: "2-Seater Sofa", width: 6, height: 3 },
  { id: "sofa-3", type: "sofa", label: "3-Seater Sofa", width: 8, height: 3 },
  { id: "sofa-corner", type: "sofa", label: "Corner Sofa", width: 8, height: 8 },
  { id: "table-coffee", type: "table", label: "Coffee Table", width: 4, height: 2 },
  { id: "table-dining", type: "table", label: "Dining Table", width: 6, height: 4 },
  { id: "bed-single", type: "bed", label: "Single Bed", width: 3.5, height: 6.5 },
  { id: "bed-queen", type: "bed", label: "Queen Bed", width: 5, height: 7 },
  { id: "cabinet-main", type: "cabinet", label: "Cabinet", width: 4, height: 2 },
  { id: "shape-rect", type: "shape", label: "Rectangle", width: 5, height: 5 },
  { id: "shape-square-area", type: "shape", label: "Square Area", width: 10, height: 10 },
  { id: "shape-square", type: "shape", label: "Square", width: 4, height: 4 },
];

interface SketchPadProps {
  onSave: (dataUrl: string) => void;
  initialData?: string;
  width?: number;
  height?: number;
  unitPrefix?: string; // "ft" or "mm"
  readOnly?: boolean;
}

export function SketchPad({ onSave, initialData, width = 600, height = 400, unitPrefix = "ft", readOnly = false }: SketchPadProps) {
  const [internalSize, setInternalSize] = useState({ width, height });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<"drawing" | "block">("drawing");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [showAllMeasurements, setShowAllMeasurements] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(2);
  const [mode, setMode] = useState<"pencil" | "line" | "rect" | "measure" | "circle" | "delete" | "pan" | "calibrate" | "select">("pencil");

  // Viewport state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [lastTouchPos, setLastTouchPos] = useState<Point | null>(null);
  const [lastScreenPos, setLastScreenPos] = useState<Point | null>(null);
  const [lastTouchDist, setLastTouchDist] = useState<number | null>(null);

  // Smart features state
  const [gridSize, setGridSize] = useState(20);
  const [referenceScale, setReferenceScale] = useState(100); // represents total width in unitPrefix




  // Sync gridSize with referenceScale and unitPrefix
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas && !internalSize.width) return;

    // Width represents 'referenceScale' units
    const pixelsPerUnit = (canvas?.width || internalSize.width) / (referenceScale || 1);
    const isFeet = unitPrefix.toLowerCase().startsWith("f"); // handles "ft", "feet"
    const subdivisions = isFeet ? 12 : 10;

    const newMinorGridSize = pixelsPerUnit / subdivisions;

    // Safety: avoid extremely dense grids that could hang the UI
    // If subdivisions are too small (less than 4px), we show larger steps
    if (newMinorGridSize >= 4) {
      setGridSize(newMinorGridSize);
    } else if (pixelsPerUnit >= 4) {
      setGridSize(pixelsPerUnit); // Show only major lines
    } else {
      setGridSize(20); // Fallback to default
    }
  }, [unitPrefix, referenceScale, internalSize.width]);



  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [autoStraighten, setAutoStraighten] = useState(true);
  const [snapToEndpoints, setSnapToEndpoints] = useState(true);
  const [isContinuous, setIsContinuous] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);



  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);


  // Handle responsive canvas resizing
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        setInternalSize((prev) => {
          if (prev.width !== newWidth || prev.height !== newHeight) {
            // Maintain physical scale: update referenceScale proportional to width change
            // scale = width / referenceScale => newRef = newWidth / currentScale
            if (prev.width > 0) {
              setReferenceScale(s => (s * newWidth) / prev.width);
            }
            return { width: newWidth, height: newHeight };
          }
          return prev;
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [width]); // Re-run if initial width prop changes

  const saveToUndo = useCallback(() => {
    setUndoStack(prev => [...prev, shapes]);
    setRedoStack([]);
  }, [shapes]);

  const updateShapes = (newShapes: Shape[]) => {
    saveToUndo();
    setShapes(newShapes);
  };



  const undo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(prev => [shapes, ...prev]);
    setUndoStack(prev => prev.slice(0, -1));
    setShapes(previous);
    setSelectedShapeId(null);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setUndoStack(prev => [...prev, shapes]);
    setRedoStack(prev => prev.slice(1));
    setShapes(next);
    setSelectedShapeId(null);
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
      setReferenceScale(10); // Automatically default scale to 10 feet
    } else {
      document.exitFullscreen();
    }
  };

  const resetView = () => {
    if (shapes.length === 0 && blocks.length === 0) {
      setZoom(0.5);
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    shapes.forEach(s => {
      if (s.type === "circle" && s.points.length === 2) {
        const center = s.points[0];
        const radius = Math.sqrt(Math.pow(s.points[1].x - center.x, 2) + Math.pow(s.points[1].y - center.y, 2));
        minX = Math.min(minX, center.x - radius);
        maxX = Math.max(maxX, center.x + radius);
        minY = Math.min(minY, center.y - radius);
        maxY = Math.max(maxY, center.y + radius);
      } else {
        s.points.forEach(p => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
      }
    });

    const canvas = canvasRef.current;
    if (!canvas) return;

    const pixelsPerUnit = canvas.width / (referenceScale || 1);
    blocks.forEach(b => {
      const w = b.width * pixelsPerUnit;
      const h = b.height * pixelsPerUnit;
      minX = Math.min(minX, b.x - w / 2);
      maxX = Math.max(maxX, b.x + w / 2);
      minY = Math.min(minY, b.y - h / 2);
      maxY = Math.max(maxY, b.y + h / 2);
    });

    if (minX === Infinity) {
      setZoom(0.5);
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    // Add padding (50 pixels)
    const padding = 50;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const maxZoomX = canvas.width / (contentWidth + padding * 2 || 1);
    const maxZoomY = canvas.height / (contentHeight + padding * 2 || 1);
    let newZoom = Math.min(maxZoomX, maxZoomY, 1.5);
    if (newZoom < 0.1) newZoom = 0.1;

    // Calculate pan offset to center the diagram
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const panX = (canvas.width / 2) - (centerX * newZoom);
    const panY = (canvas.height / 2) - (centerY * newZoom);

    setZoom(newZoom);
    setPanOffset({ x: panX, y: panY });
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
      // Calculate visible bounds in canvas coordinates
      const left = -panOffset.x / zoom;
      const top = -panOffset.y / zoom;
      const right = (canvas.width - panOffset.x) / zoom;
      const bottom = (canvas.height - panOffset.y) / zoom;

      const isFeet = unitPrefix.toLowerCase().startsWith("f");
      const subdivisions = isFeet ? 12 : 10;
      const pixelsPerUnit = gridSize * subdivisions;

      const startXIndex = Math.floor(left / gridSize);
      const endXIndex = Math.ceil(right / gridSize);
      const startYIndex = Math.floor(top / gridSize);
      const endYIndex = Math.ceil(bottom / gridSize);

      // 1. Draw minor grid lines (subdivisions)
      // Only draw if they are at least 8px apart for clarity
      if (gridSize * zoom >= 8) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(241, 245, 249, 0.6)"; // Slate 100/50
        ctx.lineWidth = 1 / zoom;

        for (let i = startXIndex; i <= endXIndex; i++) {
          if (i % subdivisions === 0) continue; // Skip major lines
          const x = i * gridSize;
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
        }
        for (let i = startYIndex; i <= endYIndex; i++) {
          if (i % subdivisions === 0) continue; // Skip major lines
          const y = i * gridSize;
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
        }
        ctx.stroke();
      }

      // 2. Draw major grid lines (the "boxes")
      ctx.beginPath();
      ctx.strokeStyle = "#cbd5e1"; // Slate 300 - clearly visible grid
      ctx.lineWidth = 1.5 / zoom;

      for (let i = startXIndex; i <= endXIndex; i++) {
        if (i % subdivisions !== 0) continue;
        const x = i * gridSize;
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      for (let i = startYIndex; i <= endYIndex; i++) {
        if (i % subdivisions !== 0) continue;
        const y = i * gridSize;
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
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
      const isSelected = s.id === selectedShapeId;
      ctx.beginPath();
      ctx.strokeStyle = s.type === "delete" ? "transparent" : (s.type === "measure" ? "#10b981" : s.color);

      // Highlight selected shape
      if (isSelected) {
        ctx.shadowBlur = 10 / zoom;
        ctx.shadowColor = "rgba(79, 70, 229, 0.4)";
      }

      ctx.lineWidth = isSelected 
        ? Math.max(s.thickness, s.thickness / zoom) + 2 / zoom 
        : Math.max(s.thickness, s.thickness / zoom);
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

        if (showAllMeasurements || s.showMeasurement || isSelected || s.type === "measure") {
          const label = `${realLen.toFixed(1)} ${unitPrefix}`;

          // Only show for lines that are long enough to hold the label comfortably
          const minLabelDist = 15;
          if (dist > minLabelDist || isSelected) {
            ctx.font = `bold ${10 / zoom}px Inter, system-ui, sans-serif`;
            const metrics = ctx.measureText(label);
            const bgW = metrics.width + 8 / zoom;
            const bgH = 15 / zoom;
            const centerX = (s.points[0].x + s.points[1].x) / 2;
            const centerY = (s.points[0].y + s.points[1].y) / 2;

            ctx.save();
            ctx.translate(centerX, centerY);

            // Smarter orientation: keep labels readable (mostly horizontal or upward)
            const angle = Math.atan2(s.points[1].y - s.points[0].y, s.points[1].x - s.points[0].x);
            let drawAngle = angle;
            if (Math.abs(angle) > Math.PI / 2) drawAngle += Math.PI;
            ctx.rotate(drawAngle);

            ctx.fillStyle = isSelected ? "#4f46e5" : "rgba(255, 255, 255, 0.9)";
            ctx.beginPath();
            ctx.roundRect(-bgW / 2, -bgH / 2, bgW, bgH, 3 / zoom);
            ctx.fill();

            if (!isSelected) {
              ctx.strokeStyle = "#cbd5e1";
              ctx.lineWidth = 0.5 / zoom;
              ctx.stroke();
            }

            ctx.fillStyle = isSelected ? "#ffffff" : "#334155";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, 0, 0);
            ctx.restore();
          }
        }

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

      // Draw endpoint indicators (dots) - ONLY FOR SELECTED OR DRAWING
      if (s.points.length > 0 && s.type !== "delete" && (isSelected || isDrawing)) {
        ctx.fillStyle = s.type === "measure" ? "#10b981" : "#4f46e5";
        [s.points[0], s.points[s.points.length - 1]].forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2 / zoom, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    };

    const drawBlock = (b: Block) => {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate((b.rotation * Math.PI) / 180);

      const pxWidth = (b.width / referenceScale) * canvas.width;
      const pxHeight = (b.height / referenceScale) * (canvas.width * (canvas.height / canvas.width)); // Correct for aspect ratio if needed, but let's assume square pixels
      // Actually, pixelsPerUnit for width and height should be consistent.
      const pixelsPerUnit = canvas.width / referenceScale;
      const w = b.width * pixelsPerUnit;
      const h = b.height * pixelsPerUnit;

      // Visual styling based on type
      const isSelected = b.id === selectedBlockId;
      ctx.shadowBlur = isSelected ? 15 / zoom : 5 / zoom;
      ctx.shadowColor = isSelected ? "rgba(79, 70, 229, 0.4)" : "rgba(0, 0, 0, 0.1)";
      ctx.shadowOffsetX = 2 / zoom;
      ctx.shadowOffsetY = 2 / zoom;

      // Draw block body with rounded corners
      ctx.strokeStyle = isSelected ? "#4f46e5" : (b.color || "#64748b");
      ctx.lineWidth = (isSelected ? 3 : 1.5) / zoom;

      const mainFill = b.color || "#64748b";
      const gradient = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      gradient.addColorStop(0, isSelected ? "rgba(245, 247, 255, 0.95)" : "rgba(255, 255, 255, 0.95)");
      gradient.addColorStop(1, isSelected ? "rgba(238, 242, 255, 0.95)" : "rgba(248, 250, 252, 0.95)");

      ctx.fillStyle = gradient;

      // Helper for rounded rect
      const r = 4 / zoom;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, r);
      ctx.fill();
      ctx.stroke();

      // Reset shadows for details
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Detailed Furniture Representation
      ctx.strokeStyle = isSelected ? "rgba(79, 70, 229, 0.5)" : "rgba(100, 116, 139, 0.3)";
      ctx.lineWidth = 1 / zoom;

      if (b.type === "sofa") {
        // Draw sofa backrest
        ctx.strokeRect(-w / 2 + 5 / zoom, -h / 2 + 2 / zoom, w - 10 / zoom, 8 / zoom);
        // Draw arms
        ctx.strokeRect(-w / 2 + 2 / zoom, -h / 2 + 10 / zoom, 6 / zoom, h - 12 / zoom);
        ctx.strokeRect(w / 2 - 8 / zoom, -h / 2 + 10 / zoom, 6 / zoom, h - 12 / zoom);
        // Seat cushions
        if (w > 40 / zoom) {
          ctx.beginPath();
          ctx.moveTo(0, -h / 2 + 10 / zoom);
          ctx.lineTo(0, h / 2 - 2 / zoom);
          ctx.stroke();
        }
      } else if (b.type === "bed") {
        // Pillows
        const pW = w * 0.3;
        const pH = h * 0.2;
        ctx.strokeRect(-w / 2 + 5 / zoom, -h / 2 + 5 / zoom, pW, pH);
        if (w > 30 / zoom) {
          ctx.strokeRect(w / 2 - 5 / zoom - pW, -h / 2 + 5 / zoom, pW, pH);
        }
        // Blanket line
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 2 / zoom, -h / 2 + h * 0.4);
        ctx.lineTo(w / 2 - 2 / zoom, -h / 2 + h * 0.4);
        ctx.stroke();
      } else if (b.type === "table") {
        // Inner border for table
        ctx.strokeRect(-w / 2 + 4 / zoom, -h / 2 + 4 / zoom, w - 8 / zoom, h - 8 / zoom);
        // Chairs (represented by circles if it's a dining table)
        if (b.label.toLowerCase().includes("dining")) {
          const chairR = 4 / zoom;
          // Side chairs
          ctx.beginPath(); ctx.arc(-w / 2 - chairR, 0, chairR, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(w / 2 + chairR, 0, chairR, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (b.type === "cabinet") {
        // Draw handles/lines
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 2 / zoom, 0); ctx.lineTo(w / 2 - 2 / zoom, 0); ctx.stroke();
        ctx.strokeRect(-w / 2 + w * 0.2, 2 / zoom, 4 / zoom, 2 / zoom);
        ctx.strokeRect(w / 2 - w * 0.2 - 4 / zoom, 2 / zoom, 4 / zoom, 2 / zoom);
      }

      // Selection indicator (corner handles if selected)
      if (isSelected) {
        ctx.fillStyle = "#4f46e5";
        const hSize = 5 / zoom;
        [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].forEach(([px, py]) => {
          ctx.fillRect(px - hSize / 2, py - hSize / 2, hSize, hSize);
        });
      }

      ctx.restore();

      // Label with Background for readability
      const labelText = `${b.width}×${b.height}${unitPrefix}`;
      ctx.font = `bold ${10 / zoom}px Inter, system-ui, sans-serif`;
      const metrics = ctx.measureText(labelText);
      const bgW = metrics.width + 8 / zoom;
      const bgH = 14 / zoom;

      ctx.save();
      ctx.translate(b.x * zoom + panOffset.x, b.y * zoom + panOffset.y);

      // Text Background
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.roundRect(-bgW / 2, -bgH / 2 - 2 / zoom, bgW, bgH, 4 / zoom);
      ctx.fill();

      ctx.fillStyle = "#1e293b";
      ctx.textAlign = "center";
      ctx.fillText(labelText, 0, 0);

      ctx.font = `black uppercase ${7 / zoom}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "#64748b";
      ctx.fillText(b.label, 0, 8 / zoom);
      ctx.restore();
    };

    if (activeTab === "drawing") {
      shapes.forEach(drawShape);
      if (currentShape) drawShape(currentShape);
    } else {
      blocks.forEach(drawBlock);
    }
    ctx.restore();
  }, [shapes, currentShape, blocks, selectedBlockId, activeTab, showGrid, gridSize, referenceScale, unitPrefix, initialImage, zoom, panOffset]);

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
    if (readOnly) return;
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

    if (activeTab === "block") {
      // Hit detection for blocks
      const canvas = canvasRef.current;
      if (!canvas) return;

      const clickedBlock = [...blocks].reverse().find(b => {
        const pixelsPerUnit = canvas.width / referenceScale;
        const w = b.width * pixelsPerUnit;
        const h = b.height * pixelsPerUnit;

        const dx = pos.x - b.x;
        const dy = pos.y - b.y;

        // Transform click pos to block local space
        const angle = -(b.rotation * Math.PI) / 180;
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle);

        return Math.abs(localX) < w / 2 && Math.abs(localY) < h / 2;
      });

      if (clickedBlock) {
        setSelectedBlockId(clickedBlock.id);
        setIsDrawing(true);
        setLastTouchPos(pos);
      } else {
        setSelectedBlockId(null);
      }
      return;
    }

    if (mode === "pan") {
      setIsDrawing(true);
      const clientX = "touches" in e ? e.touches[0].clientX : (e as any).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as any).clientY;
      setLastScreenPos({ x: clientX, y: clientY });
      return;
    }



    // (Smart Selection block removed: It hijacked the drawing tools and prevented drawing from endpoints. Select tool should be used for selection.)

    if (mode === "select" || mode === "delete") {
      const threshold = 15 / zoom;
      let foundId: string | null = null;

      const newShapes: Shape[] = [];

      shapes.forEach(s => {
        if (foundId && mode === "select") {
          newShapes.push(s);
          return;
        }

        const points = s.points;
        if (points.length < 1) {
          newShapes.push(s);
          return;
        }

        let hit = false;
        if ((s.type === "line" || s.type === "measure") && points.length >= 2) {
          hit = getPointToSegmentDist(pos, points[0], points[1]) < threshold;
        } else if (s.type === "rect" && points.length >= 2) {
          const [p1, p2] = points;
          hit = getPointToSegmentDist(pos, p1, { x: p2.x, y: p1.y }) < threshold ||
            getPointToSegmentDist(pos, { x: p2.x, y: p1.y }, p2) < threshold ||
            getPointToSegmentDist(pos, p2, { x: p1.x, y: p2.y }) < threshold ||
            getPointToSegmentDist(pos, { x: p1.x, y: p2.y }, p1) < threshold;
        } else if (s.type === "circle" && points.length >= 2) {
          const center = points[0];
          const radius = Math.sqrt(Math.pow(points[1].x - center.x, 2) + Math.pow(points[1].y - center.y, 2));
          const dist = Math.sqrt(Math.pow(pos.x - center.x, 2) + Math.pow(pos.y - center.y, 2));
          hit = Math.abs(dist - radius) < threshold;
        } else if (s.type === "pencil") {
          hit = points.some(p => Math.sqrt(Math.pow(p.x - pos.x, 2) + Math.pow(p.y - pos.y, 2)) < threshold);
        }

        if (hit) {
          foundId = s.id;
          if (mode === "delete") {
            // ADVANCED ERASE SYSTEM: Handles splitting for ALL types
            let subPoints: Point[] = [];

            if (s.type === "line" || s.type === "measure") {
              const p1 = points[0];
              const p2 = points[1];
              for (let i = 0; i <= 40; i++) subPoints.push({ x: p1.x + (p2.x - p1.x) * (i / 40), y: p1.y + (p2.y - p1.y) * (i / 40) });
            } else if (s.type === "rect") {
              const [p1, p2] = points;
              for (let i = 0; i <= 20; i++) subPoints.push({ x: p1.x + (p2.x - p1.x) * (i / 20), y: p1.y });
              for (let i = 0; i <= 20; i++) subPoints.push({ x: p2.x, y: p1.y + (p2.y - p1.y) * (i / 20) });
              for (let i = 0; i <= 20; i++) subPoints.push({ x: p2.x - (p2.x - p1.x) * (i / 20), y: p2.y });
              for (let i = 0; i <= 20; i++) subPoints.push({ x: p1.x, y: p2.y - (p2.y - p1.y) * (i / 20) });
            } else if (s.type === "circle") {
              const center = points[0];
              const radius = Math.sqrt(Math.pow(points[1].x - center.x, 2) + Math.pow(points[1].y - center.y, 2));
              for (let i = 0; i <= 80; i++) {
                const angle = (i / 80) * Math.PI * 2;
                subPoints.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
              }
            } else {
              subPoints = points;
            }

            let currentPath: Point[] = [];
            subPoints.forEach(p => {
              const dist = Math.sqrt(Math.pow(p.x - pos.x, 2) + Math.pow(p.y - pos.y, 2));
              if (dist > threshold) {
                currentPath.push(p);
              } else {
                if (currentPath.length > 5) {
                  newShapes.push({ ...s, id: Math.random().toString(), type: "pencil", points: currentPath });
                }
                currentPath = [];
              }
            });
            if (currentPath.length > 5) {
              newShapes.push({ ...s, id: Math.random().toString(), type: "pencil", points: currentPath });
            }
            return;
          }
        }
        newShapes.push(s);
      });


      if (mode === "select") {
        setSelectedShapeId(foundId);
        setIsDrawing(foundId !== null);
      } else if (mode === "delete") {
        if (newShapes.length !== shapes.length) updateShapes(newShapes);
        setIsDrawing(true); // Always true so brush effect continues while dragging
      }
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

    if (mode === "delete" && isDrawing) {
      startDrawing(e as any);
      return;
    }

    if (activeTab === "block" && selectedBlockId && isDrawing && lastTouchPos) {
      const dx = pos.x - lastTouchPos.x;
      const dy = pos.y - lastTouchPos.y;

      setBlocks(prev => prev.map(b =>
        b.id === selectedBlockId
          ? { ...b, x: b.x + dx, y: b.y + dy }
          : b
      ));
      setLastTouchPos(pos);
      return;
    }

    if (mode === "select" && selectedShapeId && isDrawing && lastTouchPos) {
      const dx = pos.x - lastTouchPos.x;
      const dy = pos.y - lastTouchPos.y;

      setShapes(prev => prev.map(s =>
        s.id === selectedShapeId
          ? { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
          : s
      ));
      setLastTouchPos(pos);
      return;
    }

    if (mode === "pan" && lastScreenPos) {
      const clientX = "touches" in e ? e.touches[0].clientX : (e as any).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as any).clientY;
      const dx = clientX - lastScreenPos.x;
      const dy = clientY - lastScreenPos.y;
      setPanOffset(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));
      setLastScreenPos({ x: clientX, y: clientY });
      return;
    }

    if ("touches" in e && e.touches.length === 2) {
      // Pinch zoom
      const d = Math.sqrt(
        Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) +
        Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2)
      );
      if (lastTouchDist) {
        const delta = d / lastTouchDist;
        const canvas = canvasRef.current;
        const newZoom = Math.min(Math.max(zoom * delta, 0.1), 10);
        
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          setPanOffset(prev => ({
            x: centerX - (centerX - prev.x) * (newZoom / zoom),
            y: centerY - (centerY - prev.y) * (newZoom / zoom)
          }));
        }
        setZoom(newZoom);
      }
      setLastTouchDist(d);
      return;
    }

    if (!currentShape) return;

    if ((mode === "delete" || mode === "select") && isDrawing) {
      // Re-run hit detection for drag select/delete
      startDrawing(e as any);
      return;
    }

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
    if (activeTab === "block") {
      if (isDrawing && selectedBlockId && snapToGrid) {
        setBlocks(prev => prev.map(b =>
          b.id === selectedBlockId
            ? { ...b, x: Math.round(b.x / gridSize) * gridSize, y: Math.round(b.y / gridSize) * gridSize }
            : b
        ));
      }
      setIsDrawing(false);
      setLastTouchPos(null);
      setLastTouchDist(null);
      return;
    }

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
      updateShapes(newShapes);

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
    setLastScreenPos(null);
    setLastTouchDist(null);
  };

  const adjustShapeLength = (shapeId: string, newLength: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const newShapes = shapes.map(s => {
      if (s.id !== shapeId || s.points.length < 2) return s;

      const p1 = s.points[0];
      const p2 = s.points[1];
      const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      const targetPixels = (newLength / referenceScale) * canvas.width;

      if (dist === 0) return s;

      const ratio = targetPixels / dist;
      const newP2 = {
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio
      };

      const screenX = newP2.x * zoom + panOffset.x;
      const screenY = newP2.y * zoom + panOffset.y;
      if (screenX < 0 || screenY < 0 || screenX > canvas.width || screenY > canvas.height) {
        if (window.confirm(`This ${newLength}${unitPrefix} line extends outside the sheet. Do you want to automatically scale the sheet to fit it?`)) {
          setTimeout(resetView, 50);
        } else {
          return s; // discard edit
        }
      }

      return { ...s, points: [p1, newP2], showMeasurement: true };
    });
    const hasChanges = newShapes.some((s, idx) => s !== shapes[idx]);
    if (hasChanges) {
      updateShapes(newShapes);
    }
  };

  const rotateShape = (shapeId: string, delta: number) => {
    setShapes(prev => prev.map(s => {
      if (s.id !== shapeId) return s;
      const points = s.points;
      if (points.length === 0) return s;

      // Calculate center of the shape
      const centerX = points.reduce((a, b) => a + b.x, 0) / points.length;
      const centerY = points.reduce((a, b) => a + b.y, 0) / points.length;

      const angle = (delta * Math.PI) / 180;
      const rotatedPoints = points.map(p => {
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        return {
          x: centerX + (dx * Math.cos(angle) - dy * Math.sin(angle)),
          y: centerY + (dx * Math.sin(angle) + dy * Math.cos(angle)),
        };
      });

      return { ...s, points: rotatedPoints, rotation: (s.rotation || 0) + delta };
    }));
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Only zoom when Ctrl is held - this "keeps the scroll option" for the page
    if (e.ctrlKey) {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(Math.max(zoom * delta, 0.1), 10);
      
      setPanOffset(prev => ({
        x: mouseX - (mouseX - prev.x) * (newZoom / zoom),
        y: mouseY - (mouseY - prev.y) * (newZoom / zoom)
      }));
      setZoom(newZoom);
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
        "flex flex-col gap-2 border rounded-xl p-2 sm:p-3 bg-slate-50/50 shadow-sm transition-all scrollbar-gutter-stable",
        isFullscreen
          ? "fixed inset-0 z-[9999] w-screen h-screen bg-slate-50 p-4 overflow-y-scroll overflow-x-auto"
          : "relative w-full h-full min-h-[500px] overflow-hidden"
      )}
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          <TabsList className="bg-white border shadow-sm h-10 p-1">
            <TabsTrigger value="drawing" className="gap-2 text-xs font-bold uppercase transition-all data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Pencil className="w-3.5 h-3.5" /> Drawing
            </TabsTrigger>
            <TabsTrigger value="block" className="gap-2 text-xs font-bold uppercase transition-all data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <LayoutGrid className="w-3.5 h-3.5" /> Block Builder
            </TabsTrigger>
          </TabsList>

          {/* Shared View Actions */}
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
                    className="w-16 h-5 text-[10px] p-0 px-1 font-black bg-transparent border-none focus-visible:ring-0 h-min"
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

        {/* Mode-specific Toolbar */}
        <div className="w-full">
          {activeTab === "drawing" ? (
            <div className="flex items-center gap-1 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm overflow-x-auto whitespace-nowrap">
              {/* Drawing Group */}
              <div className="flex items-center gap-1 pr-1 border-r border-slate-100 flex-shrink-0">
                {[
                  { id: "pencil", icon: Pencil, label: "Draw" },
                  { id: "line", icon: LineIcon, label: "Line" },
                  { id: "rect", icon: Square, label: "Rect" },
                  { id: "circle", icon: Circle, label: "Circle" },
                  { id: "select", icon: Monitor, label: "Select" },
                  { id: "pan", icon: Hand, label: "Pan" },
                ].map((tool) => (
                  <Button
                    key={tool.id}
                    variant={mode === tool.id ? "default" : "ghost"}
                    size="sm"
                    onClick={() => { setMode(tool.id as any); setSelectedShapeId(null); }}
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

              {/* Dynamic Action Group (appears only when shape selected) */}
              {selectedShapeId && (
                <div className="flex items-center gap-1 px-2 border-r border-slate-100 bg-indigo-50/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => rotateShape(selectedShapeId, 15)}
                    className="flex flex-col items-center gap-0.5 h-11 px-2 text-indigo-600 font-black"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="text-[8px] uppercase">Rotate</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const s = shapes.find(x => x.id === selectedShapeId);
                      if (s) {
                        const newS = { ...s, id: Math.random().toString(), points: s.points.map(p => ({ x: p.x + 20, y: p.y + 20 })) };
                        updateShapes([...shapes, newS]);
                        setSelectedShapeId(newS.id);
                      }
                    }}
                    className="flex flex-col items-center gap-0.5 h-11 px-2 text-indigo-600 font-black"
                  >
                    <Copy className="w-4 h-4" />
                    <span className="text-[8px] uppercase">Clone</span>
                  </Button>
                </div>
              )}

              {/* Precision Tools Group */}
              <div className="flex items-center gap-1 px-1 border-r border-slate-100">
                {[
                  { id: "measure", icon: Ruler, label: "Measure", variant: "measure" },
                  { id: "calibrate", icon: Ruler, label: "Calibrate", variant: "calibrate" },
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
          ) : (
            <div className="flex flex-wrap items-center gap-1 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center gap-1 pr-1 border-r border-slate-100">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!selectedBlockId}
                  onClick={() => {
                    setBlocks(prev => prev.map(b => b.id === selectedBlockId ? { ...b, rotation: (b.rotation + 90) % 360 } : b));
                  }}
                  className="flex flex-col items-center gap-0.5 h-11 w-11 px-0 text-slate-600 disabled:opacity-30"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="text-[8px] font-bold uppercase">Rotate</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!selectedBlockId}
                  onClick={() => {
                    const b = blocks.find(x => x.id === selectedBlockId);
                    if (b) {
                      const newBlock = { ...b, id: Date.now().toString(), x: b.x + 20, y: b.y + 20 };
                      setBlocks([...blocks, newBlock]);
                      setSelectedBlockId(newBlock.id);
                    }
                  }}
                  className="flex flex-col items-center gap-0.5 h-11 w-11 px-0 text-slate-600 disabled:opacity-30"
                >
                  <Copy className="w-4 h-4" />
                  <span className="text-[8px] font-bold uppercase">Clone</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!selectedBlockId}
                  onClick={() => {
                    setBlocks(blocks.filter(b => b.id !== selectedBlockId));
                    setSelectedBlockId(null);
                  }}
                  className="flex flex-col items-center gap-0.5 h-11 w-11 px-0 text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-[8px] font-bold uppercase tracking-tighter">Remove</span>
                </Button>
              </div>

              <div className="flex items-center gap-2 px-2 border-r border-slate-100">
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="color"
                    value={blocks.find(b => b.id === selectedBlockId)?.color || "#64748b"}
                    onChange={(e) => {
                      if (selectedBlockId) {
                        setBlocks(prev => prev.map(b => b.id === selectedBlockId ? { ...b, color: e.target.value } : b));
                      }
                    }}
                    disabled={!selectedBlockId}
                    className="w-5 h-5 cursor-pointer border rounded-full overflow-hidden p-0 ring-1 ring-slate-200 disabled:opacity-30"
                  />
                  <span className="text-[8px] font-bold text-slate-400 uppercase leading-none">Color</span>
                </div>
              </div>
              <div className="flex items-center gap-1 px-1 border-r border-slate-100">
                <Button
                  variant={mode !== "select" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => { setMode("pencil"); setIsDrawing(false); }}
                  className={cn(
                    "flex flex-col items-center gap-0.5 h-11 w-11 px-0 border border-transparent shadow-none",
                    mode !== "select" ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Monitor className="w-4 h-4" />
                  <span className="text-[8px] font-bold uppercase">Select</span>
                </Button>
              </div>
              <p className="hidden sm:block text-[9px] font-bold text-slate-400 uppercase px-3 italic">
                {selectedBlockId ? "Select & drag to move block" : "Select a block from library to add"}
              </p>
            </div>
          )}
        </div>
      </Tabs>

      {/* Responsive Toggles Bar */}
      <div className="flex items-center gap-x-4 px-3 py-1.5 bg-white/30 rounded-lg border border-slate-200/50 backdrop-blur-sm overflow-x-auto whitespace-nowrap scrollbar-thin">
        {[
          { id: "grid-toggle", checked: showGrid, onChange: setShowGrid, icon: Grid3X3, label: "Grid" },
          { id: "snap-toggle", checked: snapToGrid, onChange: setSnapToGrid, label: "Snap Grid" },
          { id: "straight-toggle", checked: autoStraighten, onChange: setAutoStraighten, label: "Straighten" },
          { id: "snap-endpoints-toggle", checked: snapToEndpoints, onChange: setSnapToEndpoints, label: "Endpoints" },
          { id: "continuous-toggle", checked: isContinuous, onChange: setIsContinuous, icon: Waypoints, label: "Continuous" },
        ].map((toggle) => (
          <div key={toggle.id} className="flex items-center gap-2 flex-shrink-0">
            <Switch id={toggle.id} checked={toggle.checked} onCheckedChange={toggle.onChange} className="scale-75 origin-left" />
            <Label htmlFor={toggle.id} className="text-[9px] font-bold text-slate-500 flex items-center gap-1 uppercase cursor-pointer hover:text-indigo-600 transition-colors">
              {toggle.icon && <toggle.icon className="w-2.5 h-2.5" />} {toggle.label}
            </Label>
          </div>
        ))}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Switch id="show-measurements-toggle" checked={showAllMeasurements} onCheckedChange={setShowAllMeasurements} className="scale-75 origin-left" />
          <Label htmlFor="show-measurements-toggle" className="text-[9px] font-bold text-slate-500 flex items-center gap-1 uppercase cursor-pointer hover:text-indigo-600 transition-colors">
            <Ruler className="w-2.5 h-2.5" /> Show All Measurements
          </Label>
        </div>

        <Button variant="ghost" size="sm" onClick={() => { setShapes([]); setBlocks([]); }} className="ml-auto h-7 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 uppercase font-black gap-1.5 px-3">
          <Trash2 className="w-3.5 h-3.5" /> Clear All
        </Button>
      </div>

      <div className="flex gap-4 flex-1 min-h-[500px]">
        {activeTab === "block" && (
          <div className="w-72 bg-slate-50/80 backdrop-blur-md border border-slate-200/60 rounded-2xl p-4 overflow-y-auto shadow-xl hidden md:flex flex-col gap-5">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                  <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Library</h3>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Drag or Click to add</span>
                </div>
                <div className="p-1.5 bg-white rounded-lg shadow-sm border border-slate-100">
                  <Layout className="w-3.5 h-3.5 text-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {PREDEFINED_BLOCKS.map(block => (
                  <button
                    key={block.id}
                    onClick={() => {
                      const canvas = canvasRef.current;
                      if (!canvas) return;
                      const newBlock: Block = {
                        id: Date.now().toString(),
                        type: block.type,
                        label: block.label,
                        width: block.width,
                        height: block.height,
                        rotation: 0,
                        x: (canvas.width / 2 - panOffset.x) / zoom,
                        y: (canvas.height / 2 - panOffset.y) / zoom,
                        color: color // Use current selected color
                      };
                      setBlocks([...blocks, newBlock]);
                      setSelectedBlockId(newBlock.id);
                    }}
                    className="flex flex-col items-center justify-center p-3 border border-white rounded-2xl hover:border-indigo-200 hover:bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all group bg-white/40 shadow-sm"
                  >
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center mb-2 shadow-sm border border-slate-100 group-hover:border-indigo-200 group-hover:shadow-md transition-all">
                      {block.type === "sofa" && <Armchair className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />}
                      {block.type === "bed" && <Bed className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />}
                      {block.type === "table" && <LayoutGrid className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />}
                      {block.type === "cabinet" && <Monitor className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />}
                      {block.type === "shape" && <Square className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />}
                    </div>
                    <span className="text-[9px] font-bold text-slate-700 group-hover:text-indigo-600 uppercase text-center line-clamp-1">{block.label}</span>
                    <span className="text-[7px] font-black text-slate-400 mt-0.5 bg-slate-100 px-1.5 rounded-full">{block.width}×{block.height}{unitPrefix}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-auto p-2 bg-indigo-50 rounded-lg border border-indigo-100">
              <p className="text-[8px] font-bold text-indigo-600 uppercase leading-relaxed">
                Tip: Blocks snap to grid and can be rotated, cloned, or deleted using the toolbar above.
              </p>
            </div>
          </div>
        )}

        <div ref={canvasContainerRef} className="relative bg-white border border-slate-200 rounded-xl shadow-inner overflow-hidden cursor-crosshair group flex-1">
          <canvas
            ref={canvasRef}
            width={internalSize.width}
            height={internalSize.height}
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
          {activeTab === "drawing" && selectedShapeId && (() => {
            const s = shapes.find(x => x.id === selectedShapeId);
            if (!s || s.points.length < 2) return null;
            const dist = Math.sqrt(Math.pow(s.points[1].x - s.points[0].x, 2) + Math.pow(s.points[1].y - s.points[0].y, 2));
            const realLen = (dist / (canvasRef.current?.width || 1)) * referenceScale;
            if (realLen < 0.1) return null; // Hide overlay for zero/tiny lines

            return (
              <div
                className="absolute z-10 bg-white/95 backdrop-blur-sm border-2 border-indigo-500 rounded-xl p-2 shadow-2xl transition-all"
                style={{
                  left: `${(() => {
                    const centerX = s.points.reduce((a, b) => a + b.x, 0) / s.points.length;
                    return centerX * zoom + panOffset.x;
                  })()}px`,
                  top: `${(() => {
                    const centerY = s.points.reduce((a, b) => a + b.y, 0) / s.points.length;
                    return centerY * zoom + panOffset.y - 50;
                  })()}px`,
                  transform: "translateX(-50%)"
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-indigo-400 uppercase leading-none mb-1">Set Length</span>
                    <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                      <Input
                        type="number"
                        defaultValue={realLen.toFixed(1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            adjustShapeLength(selectedShapeId, parseFloat((e.target as HTMLInputElement).value));
                            setSelectedShapeId(null);
                          }
                        }}
                        className="w-16 h-7 text-xs font-bold border-none bg-transparent p-0 focus-visible:ring-0"
                      />
                      <span className="text-[10px] font-black text-slate-400">{unitPrefix}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-slate-400 hover:text-indigo-600"
                      onClick={() => {
                        rotateShape(selectedShapeId, 15);
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => { updateShapes(shapes.filter(s => s.id !== selectedShapeId)); setSelectedShapeId(null); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-slate-400 hover:text-indigo-600"
                      onClick={() => {
                        const s = shapes.find(x => x.id === selectedShapeId);
                        if (s) {
                          updateShapes(shapes.map(x => x.id === s.id ? { ...x, showMeasurement: !x.showMeasurement } : x));
                        }
                      }}
                    >
                      <Ruler className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          {!isDrawing && shapes.length === 0 && blocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300">
              <div className="text-center opacity-10 group-hover:opacity-20 transition-opacity">
                <Grid3X3 className="w-16 h-16 mx-auto mb-3" />
                <p className="text-lg font-black uppercase tracking-[0.2em] text-slate-800">Smart Canvas</p>
                <p className="text-xs font-bold text-slate-500 mt-1">Select a tool to start your technical sketch</p>
              </div>
            </div>
          )}

          {/* Floating Zoom Controls */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetView}
              className="bg-white/90 backdrop-blur-md border-slate-200 shadow-md hover:bg-slate-50 text-[9px] font-black tracking-widest text-slate-600 hover:text-indigo-600 uppercase h-8 px-3"
              title="Reset Graph Zoom & Position"
            >
              Reset View
            </Button>
            <div className="flex flex-col items-center bg-white/80 backdrop-blur-sm border border-slate-200 px-2 py-1.5 rounded-lg shadow-sm">
              <span className="text-[8px] font-black text-slate-400 uppercase leading-none mb-1">Zoom</span>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  value={Math.round(zoom * 100)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) setZoom(val / 100);
                  }}
                  className="w-10 h-4 text-[10px] font-black text-indigo-600 bg-transparent border-none p-0 text-center focus-visible:ring-0 outline-none"
                />
                <span className="text-[10px] font-black text-indigo-600 leading-none">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold px-2 py-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" /> Ctrl+Wheel to Zoom</span>
          <span className="flex items-center gap-1"><Monitor className="w-3 h-3 text-slate-400" /> {activeTab === "block" ? "Select block to edit" : "Click to draw"}</span>
        </div>
        <p className="uppercase tracking-tighter opacity-70 italic text-right">Drawing Area: {Math.round(internalSize.width)} x {Math.round(internalSize.height)} px</p>
      </div>
    </div>
  );
}