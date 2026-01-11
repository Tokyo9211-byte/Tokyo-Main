
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { BarcodeFormat, BarcodeConfig, BarcodeItem } from '../types';
import { convertToPx } from './unitConverter';

// Use an ultra-high internal DPI for rendering to ensure vector-like quality in the final PDF
// 2400 DPI is significantly higher than most professional commercial printers (which usually peak at 1200)
const ULTRA_RES_DPI = 2400;

export const validateBarcode = (data: string, format: BarcodeFormat): { valid: boolean; error?: string } => {
  if (!data) return { valid: false, error: 'Empty data' };

  try {
    switch (format) {
      case BarcodeFormat.EAN13:
        return /^\d{12,13}$/.test(data) ? { valid: true } : { valid: false, error: 'EAN-13: 12-13 digits required' };
      case BarcodeFormat.EAN8:
        return /^\d{7,8}$/.test(data) ? { valid: true } : { valid: false, error: 'EAN-8: 7-8 digits required' };
      case BarcodeFormat.UPCA:
        return /^\d{11,12}$/.test(data) ? { valid: true } : { valid: false, error: 'UPC-A: 11-12 digits required' };
      case BarcodeFormat.ITF14:
        return /^\d{13,14}$/.test(data) ? { valid: true } : { valid: false, error: 'ITF-14: 13-14 digits required' };
      case BarcodeFormat.PHARMACODE:
        const n = parseInt(data);
        return (!isNaN(n) && n >= 3 && n <= 131071) ? { valid: true } : { valid: false, error: 'Pharmacode: 3-131071' };
      case BarcodeFormat.QR:
        return { valid: true };
      default:
        return { valid: true };
    }
  } catch (e) {
    return { valid: false, error: 'Validation error' };
  }
};

/**
 * Renders the barcode at an ultra-high resolution (2400 DPI).
 * This ensures that even when zoomed 400% in a PDF, the lines remain perfectly sharp.
 */
export const renderBarcodeToDataUrl = async (item: BarcodeItem, config: BarcodeConfig): Promise<string> => {
  if (!item.valid) return '';

  const canvas = document.createElement('canvas');
  
  // Calculate high-resolution dimensions
  const widthPx = convertToPx(config.width, config.unit, ULTRA_RES_DPI);
  const heightPx = convertToPx(config.height, config.unit, ULTRA_RES_DPI);
  const marginPx = convertToPx(config.margin, config.unit, ULTRA_RES_DPI);

  try {
    if (config.format === BarcodeFormat.QR) {
      // For QR codes, we use maximum error correction and high resolution
      return await QRCode.toDataURL(item.data, {
        width: widthPx,
        margin: Math.round(marginPx / (widthPx / 40)), 
        color: {
          dark: config.barcodeColor,
          light: config.backgroundColor,
        },
        errorCorrectionLevel: 'H', 
      });
    } else {
      // For 1D barcodes, module width is critical. 
      // We calculate the optimal module width to fill the requested physical size at 2400 DPI.
      // This creates a very large source image that jsPDF will scale down, preserving all detail.
      const moduleWidth = Math.max(1, Math.floor(widthPx / 180)); 

      JsBarcode(canvas, item.data, {
        format: config.format,
        width: moduleWidth, 
        height: heightPx,
        displayValue: config.displayText,
        fontSize: Math.round(config.fontSize * (ULTRA_RES_DPI / 72)), // Scale font relative to DPI
        background: config.backgroundColor,
        lineColor: config.barcodeColor,
        margin: marginPx,
        text: item.label || item.data,
        textAlign: 'center',
        textMargin: 10,
        flat: true 
      });
      
      // Use PNG for lossless line quality
      return canvas.toDataURL('image/png', 1.0);
    }
  } catch (e) {
    console.error('Render failure:', e);
    return '';
  }
};
