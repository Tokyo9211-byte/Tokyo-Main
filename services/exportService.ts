
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { BarcodeItem, BarcodeConfig, PageSetup, Unit } from '../types';
import { renderBarcodeToDataUrl } from './barcodeGenerator';
import { UNIT_FACTORS } from '../constants';

/**
 * Converts any value to a normalized unit (inches) for internal calculations
 */
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

  // Convert everything to internal normalized units (Inches) for comparison
  const pW_in = toInches(pWidth, unit);
  const pH_in = toInches(pHeight, unit);
  const mL_in = toInches(pageSetup.marginLeft, unit);
  const mR_in = toInches(pageSetup.marginRight, unit);
  const mT_in = toInches(pageSetup.marginTop, unit);
  const mB_in = toInches(pageSetup.marginBottom, unit);
  const gut_in = toInches(pageSetup.gutter, unit);

  const bW_in = toInches(config.width, bUnit);
  const bH_in = toInches(config.height, bUnit);

  const availableW = pW_in - mL_in - mR_in;
  const availableH = pH_in - mT_in - mB_in;

  // Calculate actual fit
  const cols = Math.floor((availableW + gut_in + 0.0001) / (bW_in + gut_in)) || 0;
  const rows = Math.floor((availableH + gut_in + 0.0001) / (bH_in + gut_in)) || 0;

  // Efficiency and Analysis
  const totalArea = availableW * availableH;
  const usedArea = cols * rows * bW_in * bH_in;
  const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

  const suggestions: string[] = [];
  
  // Suggestion: "If you reduced margin by..."
  const remW = (availableW + gut_in) % (bW_in + gut_in);
  const neededForNextCol = (bW_in + gut_in) - remW;
  if (neededForNextCol < 0.2) { // if only 0.2 inches away
    suggestions.push(`Reduce horizontal margins by ${neededForNextCol.toFixed(2)}in to fit another column.`);
  }

  const remH = (availableH + gut_in) % (bH_in + gut_in);
  const neededForNextRow = (bH_in + gut_in) - remH;
  if (neededForNextRow < 0.2) {
    suggestions.push(`Reduce vertical margins by ${neededForNextRow.toFixed(2)}in to fit another row.`);
  }

  return {
    cols,
    rows,
    bWidth: config.width,
    bHeight: config.height,
    gutter: pageSetup.gutter,
    pWidth,
    pHeight,
    mLeft: pageSetup.marginLeft,
    mRight: pageSetup.marginRight,
    mTop: pageSetup.marginTop,
    mBottom: pageSetup.marginBottom,
    totalCapacity: cols * rows,
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
  const folder = zip.folder('high_res_barcodes');
  const validBarcodes = barcodes.filter(b => b.valid);
  
  for (let i = 0; i < validBarcodes.length; i++) {
    const item = validBarcodes[i];
    const dataUrl = await renderBarcodeToDataUrl(item, config);
    folder?.file(`${item.data.replace(/[^a-z0-9]/gi, '_')}_${i + 1}.png`, dataUrl.split(',')[1], { base64: true });
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
  const doc = new jsPDF({
    orientation: pageSetup.orientation,
    unit: pageSetup.unit === Unit.PX ? 'pt' : pageSetup.unit,
    format: pageSetup.pageSize === 'Custom' ? [pageSetup.width, pageSetup.height] : pageSetup.pageSize.toLowerCase(),
    compress: false
  });

  const grid = calculateGrid(pageSetup, config);
  const validBarcodes = barcodes.filter(b => b.valid);
  if (validBarcodes.length === 0 || grid.totalCapacity === 0) return;

  // Convert config width/height to page setup units for placement
  const bW_pageUnits = config.width * (UNIT_FACTORS[pageSetup.unit] / UNIT_FACTORS[config.unit]);
  const bH_pageUnits = config.height * (UNIT_FACTORS[pageSetup.unit] / UNIT_FACTORS[config.unit]);
  
  const actualGridW = grid.cols * bW_pageUnits + (grid.cols - 1) * grid.gutter;
  const actualGridH = grid.rows * bH_pageUnits + (grid.rows - 1) * grid.gutter;

  // Centering logic
  const availableW = grid.pWidth - grid.mLeft - grid.mRight;
  const availableH = grid.pHeight - grid.mTop - grid.mBottom;
  const xStart = grid.mLeft + (availableW - actualGridW) / 2;
  const yStart = grid.mTop + (availableH - actualGridH) / 2;

  let count = 0;
  while (count < validBarcodes.length) {
    if (count > 0) doc.addPage();
    
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (count >= validBarcodes.length) break;
        
        const x = xStart + c * (bW_pageUnits + grid.gutter);
        const y = yStart + r * (bH_pageUnits + grid.gutter);

        const dataUrl = await renderBarcodeToDataUrl(validBarcodes[count], config);
        doc.addImage(dataUrl, 'PNG', x, y, bW_pageUnits, bH_pageUnits, undefined, 'NONE');
        count++;
      }
    }
    onProgress(Math.round((count / validBarcodes.length) * 100));
  }

  doc.save(`industrial_labels_${Date.now()}.pdf`);
};
