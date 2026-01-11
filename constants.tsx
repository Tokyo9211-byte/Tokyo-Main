
import { BarcodeFormat, Unit, LabelTemplate, PageSizeType } from './types';

export const DPI_OPTIONS = [
  { label: 'Screen (72 DPI)', value: 72 },
  { label: 'Draft (150 DPI)', value: 150 },
  { label: 'Standard Print (300 DPI)', value: 300 },
  { label: 'High Quality (600 DPI)', value: 600 },
];

export const UNIT_FACTORS = {
  [Unit.PX]: 1,
  [Unit.IN]: 1,
  [Unit.CM]: 2.54,
  [Unit.MM]: 25.4,
};

export const PAGE_SIZES: Record<PageSizeType, { width: number; height: number; unit: Unit }> = {
  A3: { width: 297, height: 420, unit: Unit.MM },
  A4: { width: 210, height: 297, unit: Unit.MM },
  A5: { width: 148, height: 210, unit: Unit.MM },
  Letter: { width: 8.5, height: 11, unit: Unit.IN },
  Legal: { width: 8.5, height: 14, unit: Unit.IN },
  Tabloid: { width: 11, height: 17, unit: Unit.IN },
  Custom: { width: 210, height: 297, unit: Unit.MM },
};

export const LABEL_TEMPLATES: LabelTemplate[] = [
  { name: 'Avery 5160 (30 labels)', cols: 3, rows: 10, width: 2.625, height: 1, unit: Unit.IN },
  { name: 'Avery 5161 (20 labels)', cols: 2, rows: 10, width: 4, height: 1, unit: Unit.IN },
  { name: 'Avery 5163 (10 labels)', cols: 2, rows: 5, width: 4, height: 2, unit: Unit.IN },
  { name: 'Avery 5167 (80 labels)', cols: 4, rows: 20, width: 1.75, height: 0.5, unit: Unit.IN },
];

export const FORMAT_GROUPS = [
  {
    name: 'RETAIL & PRODUCTS',
    formats: [
      { id: BarcodeFormat.EAN13, name: 'EAN-13', desc: '13 digits - Retail Standard' },
      { id: BarcodeFormat.EAN8, name: 'EAN-8', desc: '8 digits' },
      { id: BarcodeFormat.UPCA, name: 'UPC(A)', desc: '12 digits - US Standard' },
      { id: BarcodeFormat.UPCE, name: 'UPC(E)', desc: 'Compact' },
      { id: BarcodeFormat.JAN13, name: 'JAN-13', desc: 'Japanese Standard' },
      { id: BarcodeFormat.JAN8, name: 'JAN-8', desc: 'Japanese Compact' },
    ],
  },
  {
    name: 'GENERAL PURPOSE',
    formats: [
      { id: BarcodeFormat.CODE128, name: 'Code 128', desc: 'Most Versatile - Recommended' },
      { id: BarcodeFormat.CODE39, name: 'Code 39', desc: 'Alphanumeric' },
      { id: BarcodeFormat.CODE25, name: 'Code 25', desc: 'Standard 2 of 5' },
    ],
  },
  {
    name: 'BOOKS & MEDIA',
    formats: [
      { id: BarcodeFormat.ISBN, name: 'ISBN', desc: '10/13 digit books' },
      { id: BarcodeFormat.ISSN, name: 'ISSN', desc: '8 digit periodicals' },
    ],
  },
  {
    name: 'LOGISTICS',
    formats: [
      { id: BarcodeFormat.ITF, name: 'ITF', desc: 'Interleaved 2 of 5' },
      { id: BarcodeFormat.ITF14, name: 'ITF-14', desc: 'Shipping containers' },
    ],
  },
  {
    name: '2D CODES',
    formats: [
      { id: BarcodeFormat.QR, name: 'QR Code', desc: 'Smart Matrix Code' },
    ],
  },
];
