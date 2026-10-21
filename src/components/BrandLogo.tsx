/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
}) => {
  const iconDimensions = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  }[size];

  const textSize = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  }[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Bespoke Enterprise Symbol: Concentric Intelligence Plate & Upward Yield Vector */}
      <div className={`relative ${iconDimensions} flex items-center justify-center shrink-0`}>
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Outer ring */}
          <circle
            cx="18"
            cy="18"
            r="16.5"
            stroke="#CBC4B3"
            strokeWidth="1.2"
          />
          {/* Inner orbit */}
          <circle
            cx="18"
            cy="18"
            r="11.5"
            stroke="#2447D4"
            strokeWidth="1.4"
            strokeDasharray="2 2"
          />
          {/* Core nucleus */}
          <circle
            cx="18"
            cy="18"
            r="4.5"
            fill="#E8E3D8"
            stroke="#C2512F"
            strokeWidth="1.2"
          />
          {/* Dynamic yield accent */}
          <path
            d="M18 10V6M18 6L16 8M18 6L20 8"
            stroke="#1B1F2A"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className={`font-serif-display tracking-tight text-charcoal ${textSize} flex items-center leading-none`}>
            <span>Restaurant</span>
            <span className="text-cobalt italic ml-1">IQ</span>
          </div>
          <span className="text-[9px] uppercase tracking-[0.2em] text-mist font-mono-tech mt-0.5">
            Revenue Intelligence
          </span>
        </div>
      )}
    </div>
  );
};
