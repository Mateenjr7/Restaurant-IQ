import React from 'react';

/** Small abstract line-art per pipeline stage. Pure SVG, stroke-only, themed via currentColor. */
export const PipelineMotif: React.FC<{ index: number; className?: string }> = ({ index, className = '' }) => {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' as const };
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">{children}</svg>
  );
  switch (index) {
    case 0: // radar
      return svg(<>
        {[30, 55, 80].map((r) => <circle key={r} cx="100" cy="100" r={r} {...common} opacity={0.5} />)}
        <line x1="100" y1="100" x2="170" y2="50" {...common} opacity={0.9} />
        <path d="M100 100 L170 50 A85 85 0 0 0 100 15 Z" fill="currentColor" opacity="0.12" />
        {[[140, 80], [70, 130], [125, 140], [60, 70]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="currentColor" />)}
      </>);
    case 1: // matching
      return svg(<>
        {[40, 80, 120, 160].map((y, i) => (<g key={y}>
          <rect x="15" y={y - 10} width="50" height="20" rx="4" {...common} opacity={0.7} />
          <rect x="135" y={y - 10} width="50" height="20" rx="4" {...common} opacity={0.7} />
          <path d={`M65 ${y} C100 ${y}, 100 ${[80, 40, 160, 120][i]}, 135 ${[80, 40, 160, 120][i]}`} {...common} opacity={0.9} />
        </g>))}
      </>);
    case 2: // forecast wave
      return svg(<>
        <path d="M10 130 C35 60 50 150 75 90 S115 40 130 80" {...common} />
        <path d="M130 80 C150 110 165 50 190 70" {...common} strokeDasharray="4 4" />
        <path d="M130 80 C150 130 165 70 190 100 L190 40 C165 20 150 80 130 80 Z" fill="currentColor" opacity="0.1" />
        <line x1="10" y1="170" x2="190" y2="170" {...common} opacity={0.4} />
      </>);
    case 3: // pricing bars
      return svg(<>
        {[60, 95, 70, 130, 110, 150].map((h, i) => <rect key={i} x={20 + i * 28} y={170 - h} width="16" height={h} rx="3" {...common} opacity={i === 5 ? 1 : 0.55} fill={i === 5 ? 'currentColor' : 'none'} fillOpacity={0.18} />)}
        <path d="M20 120 L70 90 L120 100 L180 40" {...common} />
        <circle cx="180" cy="40" r="4" fill="currentColor" />
      </>);
    case 4: // shield
      return svg(<>
        <path d="M100 20 L165 45 V100 C165 140 135 165 100 182 C65 165 35 140 35 100 V45 Z" {...common} />
        <path d="M100 42 L145 59 V100 C145 128 124 146 100 158 C76 146 55 128 55 100 V59 Z" {...common} opacity={0.45} />
        <path d="M78 100 L96 118 L125 82" {...common} strokeWidth={2} />
      </>);
    default: // orchestrator nodes
      return svg(<>
        {[[100, 100], [40, 50], [160, 50], [40, 150], [160, 150], [100, 30], [100, 170]].map(([x, y], i) => (<g key={i}>
          {i > 0 && <line x1="100" y1="100" x2={x} y2={y} {...common} opacity={0.5} />}
          <circle cx={x} cy={y} r={i === 0 ? 14 : 7} {...common} fill={i === 0 ? 'currentColor' : 'none'} fillOpacity={0.2} />
        </g>))}
      </>);
  }
};
