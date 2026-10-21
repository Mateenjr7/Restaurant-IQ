import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

/** Number that eases up from 0 when it appears (Lusion/Epic-style stat reveal). */
export const CountUp: React.FC<{ value: number; prefix?: string; suffix?: string; decimals?: number }> = ({ value, prefix = '', suffix = '', decimals = 0 }) => {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const o = { v: 0 };
    const fmt = (n: number) => prefix + n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    const t = gsap.to(o, { v: value, duration: 1.8, ease: 'power3.out', onUpdate: () => { if (el.current) el.current.textContent = fmt(o.v); } });
    return () => { t.kill(); };
  }, [value, prefix, suffix, decimals]);
  return <span ref={el}>{prefix}0{suffix}</span>;
};
