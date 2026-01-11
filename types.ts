
export enum Unit {
  PX = 'px',
  IN = 'in',
  CM = 'cm',
  MM = 'mm'
}

export enum BarcodeFormat {
  EAN13 = 'EAN13',
  EAN8 = 'EAN8',
  UPCA = 'UPC',
  UPCE = 'UPCE',
  ITF = 'ITF',
  ITF14 = 'ITF14',
  ISBN = 'ISBN',
  ISSN = 'ISSN',
  JAN13 = 'JAN13',
  JAN8 = 'JAN8',
  CODE128 = 'CODE128',
  CODE39 = 'CODE39',
  CODE25 = 'CODE25',
  CODABAR = 'CODABAR',
  MSI = 'MSI',
  PHARMACODE = 'PHARMACODE',
  POSTNET = 'POSTNET',
  QR = 'QR'
}

export interface BarcodeItem {
  id: string;
  data: string;
  label?: string;
  description?: string;
  valid: boolean;
  error?: string;
  index: number;
}

export interface BarcodeConfig {
  format: BarcodeFormat;
  width: number;
  height: number;
  margin: number;
  unit: Unit;
  dpi: number;
  displayText: boolean;
  fontSize: number;
  barcodeColor: string;
  backgroundColor: string;
  textColor: string;
}

export interface LabelTemplate {
  name: string;
  cols: number;
  rows: number;
  width: number;
  height: number;
  unit: Unit;
}

export type PageSizeType = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid' | 'Custom';

export interface PageSetup {
  pageSize: PageSizeType;
  width: number;
  height: number;
  unit: Unit;
  orientation: 'portrait' | 'landscape';
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  template?: LabelTemplate;
}
