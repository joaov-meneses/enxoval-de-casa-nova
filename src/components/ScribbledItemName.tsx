import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type Stroke = { d: string; delay: number; duration: number };

/** Measure the actual text lines so the pencil follows wrapped names at any width. */
export function ScribbledItemName({
  name,
  checked,
}: {
  name: string;
  checked: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [drawing, setDrawing] = useState<{
    width: number;
    height: number;
    strokes: Stroke[];
  } | null>(null);

  useLayoutEffect(() => {
    if (!checked) {
      setDrawing(null);
      return;
    }
    const container = root.current;
    const label = text.current;
    if (!container || !label) return;
    let disposed = false;
    function measure() {
      if (disposed) return;
      const bounds = container!.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const range = document.createRange();
      range.selectNodeContents(label!);
      const lines = [...range.getClientRects()].filter(
        (rect) => rect.width > 1 && rect.height > 1,
      );
      const total = lines.reduce(
        (sum, line) => sum + Math.min(line.right, bounds.right) - line.left,
        0,
      );
      let elapsed = 0;
      const strokes = lines.map((line, index) => {
        const left = Math.max(0, line.left - bounds.left);
        const width = Math.max(
          1,
          Math.min(line.right, bounds.right) - bounds.left - left,
        );
        const center = line.top - bounds.top + line.height * 0.5;
        const points = [`M ${left + 1} ${center}`];
        // Uneven pencil strokes keep the mark handmade while leaving the name legible.
        const steps = Math.max(2, Math.ceil(width / 16));
        for (let step = 1; step <= steps; step++) {
          const x = left + ((width - 2) * step) / steps;
          const y =
            center + (step % 2 ? -1 : 1) * (0.8 + ((step + index) % 3) * 0.4);
          points.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        const duration = (620 * width) / Math.max(1, total);
        const stroke = { d: points.join(" "), delay: elapsed, duration };
        elapsed += duration;
        return stroke;
      });
      setDrawing({ width: bounds.width, height: bounds.height, strokes });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [name, checked]);

  return (
    <span ref={root} className="item-name">
      <span ref={text} className="item-name-text">
        {name}
      </span>
      {checked && drawing && (
        <svg
          className="item-name-scribble"
          viewBox={`0 0 ${drawing.width} ${drawing.height}`}
          aria-hidden="true"
          focusable="false"
        >
          {drawing.strokes.map((stroke, index) => (
            <path
              key={index}
              d={stroke.d}
              pathLength={1}
              style={
                {
                  "--pencil-delay": `${stroke.delay}ms`,
                  "--pencil-duration": `${stroke.duration}ms`,
                } as CSSProperties
              }
            />
          ))}
        </svg>
      )}
    </span>
  );
}
