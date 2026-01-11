
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { BarcodeItem, BarcodeConfig, PageSetup, Unit } from '../types';
import { renderBarcodeToDataUrl } from './barcodeGenerator';

/**
 * Calculates the optimal grid for a given page setup and barcode configuration.
 */
export const calculateGrid = (pageSetup: PageSetup, config: BarcodeConfig) => {
  const pWidth = pageSetup.width;
  const pHeight = pageSetup.height;
  const mLeft = pageSetup.marginLeft;
  const mRight = pageSetup.marginRight;
  const mTop = pageSetup.marginTop;
  const mBottom = pageSetup.marginBottom;

  const contentWidth = pWidth - mLeft - mRight;
  const contentHeight = pHeight - mTop - mBottom;

  // Industry standard: small gutter between labels if not using a fixed template
  const gutter = pageSetup.unit === Unit.IN ? 0.125 : 3; // 1/8 inch or 3mm

  let cols: number, rows: number, bWidth: number, bHeight: number;

  if (pageSetup.template) {
    cols = pageSetup.template.cols;
    rows = pageSetup.template.rows;
    bWidth = pageSetup.template.width;
    bHeight = pageSetup.template.height;
  } else {
    bWidth = config.width;
    bHeight = config.height;
    // We add gutter to the width for calculation, but subtract it for the last one
    // effective_width = cols * bWidth + (cols - 1) * gutter
    // cols * (bWidth + gutter) - gutter <= contentWidth
    cols = Math.floor((contentWidth + gutter) / (bWidth + gutter)) || 1;
    rows = Math.floor((contentHeight + gutter) / (bHeight + gutter)) || 1;
  }

  return { cols, rows, bWidth, bHeight, gutter, contentWidth, contentHeight };
};

export const exportAsZip = async (
  barcodes: BarcodeItem[],
  config: BarcodeConfig,
  onProgress: (p: number) => void
) => {
  const zip = new JSZip();
  const folder = zip.folder('barcodes');
  
  for (let i = 0; i < barcodes.length; i++) {
    const item = barcodes[i];
    if (item.valid) {
      const dataUrl = await renderBarcodeToDataUrl(item, config);
      const base64Data = dataUrl.split(',')[1];
      folder?.file(`barcode_${item.data.replace(/[^a-z0-9]/gi, '_')}_${i + 1}.png`, base64Data, { base64: true });
    }
    onProgress(Math.round(((i + 1) / barcodes.length) * 100));
  }
  
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `barcodes_${new Date().toISOString().split('T')[0]}.zip`);
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
  });

  const { cols, rows, bWidth, bHeight, gutter, contentWidth, contentHeight } = calculateGrid(pageSetup, config);
  const itemsPerPage = cols * rows;

  let currentItem = 0;
  const validBarcodes = barcodes.filter(b => b.valid);
  
  if (validBarcodes.length === 0) return;

  // Calculate offsets to center the grid on the page content area
  const gridWidth = cols * bWidth + (cols - 1) * gutter;
  const gridHeight = rows * bHeight + (rows - 1) * gutter;
  const xCenteringOffset = (contentWidth - gridWidth) / 2;
  const yCenteringOffset = (contentHeight - gridHeight) / 2;

  while (currentItem < validBarcodes.length) {
    if (currentItem > 0) doc.addPage();
    
    for (let i = 0; i < itemsPerPage && (currentItem + i) < validBarcodes.length; i++) {
      const item = validBarcodes[currentItem + i];
      
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      const x = pageSetup.marginLeft + xCenteringOffset + col * (bWidth + gutter);
      const y = pageSetup.marginTop + yCenteringOffset + row * (bHeight + gutter);

      const dataUrl = await renderBarcodeToDataUrl(item, config);
      doc.addImage(dataUrl, 'PNG', x, y, bWidth, bHeight);
    }
    
    currentItem += itemsPerPage;
    onProgress(Math.round((currentItem / validBarcodes.length) * 100));
  }

  doc.save(`barcodes_${new Date().getTime()}.pdf`);
};
