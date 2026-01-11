
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

  // Calculate actual fit with a tiny epsilon to handle rounding
  const cols = availableW > 0 ? Math.floor((availableW + gut_in + 0.0001) / (bW_in + gut_in)) : 0;
  const rows = availableH > 0 ? Math.floor((availableH + gut_in + 0.0001) / (bH_in + gut_in)) : 0;

  const usedArea = (cols > 0 && rows > 0) ? cols * rows * bW_in * bH_in : 0;
  const totalArea = availableW * availableH;
  const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

  const suggestions: string[] = [];
  
  // Suggestion Engine
  if (cols > 0 && rows > 0) {
    const remW = (availableW + gut_in) % (bW_in + gut_in);
    const neededForNextCol = (bW_in + gut_in) - remW;
    if (neededForNextCol < 0.25) {
      suggestions.push(`Reduce horizontal margins by ${neededForNextCol.toFixed(2)}in to fit +1 column.`);
    }

    const remH = (availableH + gut_in) % (bH_in + gut_in);
    const neededForNextRow = (bH_in + gut_in) - remH;
    if (neededForNextRow < 0.25) {
      suggestions.push(`Reduce vertical margins by ${neededForNextRow.toFixed(2)}in to fit +1 row.`);
    }
  } else if (availableW > 0 && availableH > 0) {
    suggestions.push("Barcode dimensions are larger than available printable area.");
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
  const folder = zip.folder('batch_export');
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
  saveAs(content, `barcodes_${Date.now()}.zip`);
};

export const exportAsPdf = async (
  barcodes: BarcodeItem[],
  config: BarcodeConfig,
  pageSetup: PageSetup,
  onProgress: (p: number) => void
) => {
  // Map our Unit enum to jsPDF expected strings
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
    alert("Nothing to export or invalid grid layout.");
    return;
  }

  // Cross-unit conversion factor for barcode dims to page units
  const scaleToPage = UNIT_FACTORS[pageSetup.unit] / UNIT_FACTORS[config.unit];
  const bW_page = config.width * scaleToPage;
  const bH_page = config.height * scaleToPage;
  const gut_page = grid.gutter; // Gutter is already in page units per calculation

  // Optimal placement: Calculate centered starting position
  const actualGridW = grid.cols * bW_page + (grid.cols - 1) * gut_page;
  const actualGridH = grid.rows * bH_page + (grid.rows - 1) * gut_page;
  const xStart = grid.mLeft + (grid.pWidth - grid.mLeft - grid.mRight - actualGridW) / 2;
  const yStart = grid.mTop + (grid.pHeight - grid.mTop - grid.mBottom - actualGridH) / 2;

  let count = 0;
  while (count < validBarcodes.length) {
    if (count > 0) doc.addPage();
    
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (count >= validBarcodes.length) break;
        
        const x = xStart + c * (bW_page + gut_page);
        const y = yStart + r * (bH_page + gut_page);

        const dataUrl = await renderBarcodeToDataUrl(validBarcodes[count], config);
        if (dataUrl) {
          doc.addImage(dataUrl, 'PNG', x, y, bW_page, bH_page, undefined, 'NONE');
        }
        count++;
      }
    }
    onProgress(Math.round((count / validBarcodes.length) * 100));
  }

  doc.save(`industrial_labels_${Date.now()}.pdf`);
};
