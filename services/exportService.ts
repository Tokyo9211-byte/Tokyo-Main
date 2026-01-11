
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { BarcodeItem, BarcodeConfig, PageSetup, Unit } from '../types';
import { renderBarcodeToDataUrl } from './barcodeGenerator';
import { UNIT_FACTORS } from '../constants';

const toInches = (value: number, unit: Unit): number => value / UNIT_FACTORS[unit];

export interface GridResult {
  cols: number;
  rows: number;
  bWidth: number;
  bHeight: number;
  gutter: number;
  pWidth: number;
  pHeight: number;
  mLeft: number;
  mRight: number;
  mTop: number;
  mBottom: number;
  totalCapacity: number;
  efficiency: number;
  suggestions: string[];
}

export const calculateGrid = (pageSetup: PageSetup, config: BarcodeConfig): GridResult => {
  const isPortrait = pageSetup.orientation === 'portrait';
  const pWidth = isPortrait ? pageSetup.width : pageSetup.height;
  const pHeight = isPortrait ? pageSetup.height : pageSetup.width;
  
  const unit = pageSetup.unit;
  const bUnit = config.unit;

  // Internal normalized units (Inches)
  const pW_in = toInches(pWidth, unit);
  const pH_in = toInches(pHeight, unit);
  const mL_in = toInches(pageSetup.marginLeft, unit);
  const mR_in = toInches(pageSetup.marginRight, unit);
  const mT_in = toInches(pageSetup.marginTop, unit);
  const mB_in = toInches(pageSetup.marginBottom, unit);
  const gut_in = toInches(pageSetup.gutter, unit);

  const bW_in = toInches(config.width, bUnit);
  const bH_in = toInches(config.height, bUnit);

  const availableW = Math.max(0, pW_in - mL_in - mR_in);
  const availableH = Math.max(0, pH_in - mT_in - mB_in);

  // Calculate actual fit with safety epsilon
  const cols = availableW > 0 ? Math.floor((availableW + gut_in + 0.0001) / (bW_in + gut_in)) : 0;
  const rows = availableH > 0 ? Math.floor((availableH + gut_in + 0.0001) / (bH_in + gut_in)) : 0;

  const usedArea = (cols > 0 && rows > 0) ? (cols * bW_in) * (rows * bH_in) : 0;
  const totalArea = pW_in * pH_in;
  const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

  const suggestions: string[] = [];
  
  if (cols > 0 && rows > 0) {
    const remW = (availableW + gut_in) % (bW_in + gut_in);
    const neededForNextCol = (bW_in + gut_in) - remW;
    if (neededForNextCol < 0.3) suggestions.push(`Reduce horizontal margins by ${neededForNextCol.toFixed(2)}in to fit 1 more column.`);

    const remH = (availableH + gut_in) % (bH_in + gut_in);
    const neededForNextRow = (bH_in + gut_in) - remH;
    if (neededForNextRow < 0.3) suggestions.push(`Reduce vertical margins by ${neededForNextRow.toFixed(2)}in to fit 1 more row.`);
  } else if (availableW > 0 && availableH > 0) {
    suggestions.push("Barcode size exceeds printable area defined by margins.");
  }

  return {
    cols: Math.max(0, cols),
    rows: Math.max(0, rows),
    bWidth: config.width,
    bHeight: config.height,
    gutter: pageSetup.gutter,
    pWidth,
    pHeight,
    mLeft: pageSetup.marginLeft,
    mRight: pageSetup.marginRight,
    mTop: pageSetup.marginTop,
    mBottom: pageSetup.marginBottom,
    totalCapacity: Math.max(0, cols * rows),
    efficiency,
    suggestions
  };
};

export const exportAsZip = async (
  barcodes: BarcodeItem[],
  config: BarcodeConfig,
  onProgress: (p: number) => void
) => {
  const zip = new JSZip();
  const folder = zip.folder('barcodes');
  const validBarcodes = barcodes.filter(b => b.valid);
  
  if (validBarcodes.length === 0) return;

  for (let i = 0; i < validBarcodes.length; i++) {
    const item = validBarcodes[i];
    const dataUrl = await renderBarcodeToDataUrl(item, config);
    if (dataUrl) {
      folder?.file(`${item.data.replace(/[^a-z0-9]/gi, '_')}_${i + 1}.png`, dataUrl.split(',')[1], { base64: true });
    }
    onProgress(Math.round(((i + 1) / validBarcodes.length) * 100));
  }
  
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `barcode_export_${Date.now()}.zip`);
};

export const exportAsPdf = async (
  barcodes: BarcodeItem[],
  config: BarcodeConfig,
  pageSetup: PageSetup,
  onProgress: (p: number) => void
) => {
  let pdfUnit: 'pt' | 'mm' | 'cm' | 'in' = 'mm';
  if (pageSetup.unit === Unit.IN) pdfUnit = 'in';
  else if (pageSetup.unit === Unit.CM) pdfUnit = 'cm';
  else if (pageSetup.unit === Unit.PX) pdfUnit = 'pt';

  const doc = new jsPDF({
    orientation: pageSetup.orientation,
    unit: pdfUnit,
    format: pageSetup.pageSize === 'Custom' ? [pageSetup.width, pageSetup.height] : pageSetup.pageSize.toLowerCase(),
    compress: false
  });

  const grid = calculateGrid(pageSetup, config);
  const validBarcodes = barcodes.filter(b => b.valid);
  
  if (validBarcodes.length === 0 || grid.totalCapacity <= 0) {
    alert("Invalid layout or no valid barcodes.");
    return;
  }

  const scale = UNIT_FACTORS[pageSetup.unit] / UNIT_FACTORS[config.unit];
  const bW_p = config.width * scale;
  const bH_p = config.height * scale;
  const gut_p = pageSetup.gutter;

  // Center the grid in the margin area
  const actualGridW = grid.cols * bW_p + (grid.cols - 1) * gut_p;
  const actualGridH = grid.rows * bH_p + (grid.rows - 1) * gut_p;
  const xStart = pageSetup.marginLeft + (grid.pWidth - pageSetup.marginLeft - pageSetup.marginRight - actualGridW) / 2;
  const yStart = pageSetup.marginTop + (grid.pHeight - pageSetup.marginTop - pageSetup.marginBottom - actualGridH) / 2;

  let count = 0;
  while (count < validBarcodes.length) {
    if (count > 0) doc.addPage();
    
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (count >= validBarcodes.length) break;
        
        const x = xStart + c * (bW_p + gut_p);
        const y = yStart + r * (bH_p + gut_p);

        const dataUrl = await renderBarcodeToDataUrl(validBarcodes[count], config);
        if (dataUrl) {
          doc.addImage(dataUrl, 'PNG', x, y, bW_p, bH_p, undefined, 'NONE');
        }
        count++;
      }
    }
    onProgress(Math.round((count / validBarcodes.length) * 100));
  }

  doc.save(`industrial_labels_${Date.now()}.pdf`);
};
