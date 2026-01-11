
import { Unit } from '../types';
import { UNIT_FACTORS } from '../constants';

export const convertToPx = (value: number, unit: Unit, dpi: number): number => {
  if (unit === Unit.PX) return value;
  // Convert to inches first, then multiply by DPI
  const inches = value / UNIT_FACTORS[unit];
  return Math.round(inches * dpi);
};

export const convertFromPx = (px: number, targetUnit: Unit, dpi: number): number => {
  if (targetUnit === Unit.PX) return px;
  const inches = px / dpi;
  return Number((inches * UNIT_FACTORS[targetUnit]).toFixed(2));
};

export const formatDisplayValue = (px: number, dpi: number): string => {
  const mm = convertFromPx(px, Unit.MM, dpi);
  const cm = convertFromPx(px, Unit.CM, dpi);
  const inch = convertFromPx(px, Unit.IN, dpi);
  return `${mm}mm / ${cm}cm / ${inch}in`;
};
