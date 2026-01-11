
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { BarcodeFormat, BarcodeConfig, BarcodeItem } from '../types';
import { convertToPx } from './unitConverter';

// 1200 DPI is the standard for high-end professional printing and ensures
// vector-like sharpness even when scaled significantly. 2400 is often too large for canvas.
const RENDER_DPI = 1200;

export const validateBarcode = (data: string, format: BarcodeFormat): { valid: boolean; error?: string } => {
  if (!data) return { valid: false, error: 'Input required' };

  try {
    switch (format) {
      case BarcodeFormat.EAN13:
        return /^\d{12,13}$/.test(data) ? { valid: true } : { valid: false, error: 'EAN-13: 12-13 digits' };
      case BarcodeFormat.EAN8:
        return /^\d{7,8}$/.test(data) ? { valid: true } : { valid: false, error: 'EAN-8: 7-8 digits' };
      case BarcodeFormat.UPCA:
        return /^\d{11,12}$/.test(data) ? { valid: true } : { valid: false, error: 'UPC-A: 11-12 digits' };
      case BarcodeFormat.ITF14:
        return /^\d{13,14}$/.test(data) ? { valid: true } : { valid: false, error: 'ITF-14: 13-14 digits' };
      case BarcodeFormat.PHARMACODE:
        const n = parseInt(data);
        return (!isNaN(n) && n >= 3 && n <= 131071) ? { valid: true } : { valid: false, error: 'Pharma: 3-131071' };
      case BarcodeFormat.QR:
        return { valid: true };
      default:
        return { valid: true };
    }
  } catch (e) {
    return { valid: false, error: 'Format error' };
  }
};

export const renderBarcodeToDataUrl = async (item: BarcodeItem, config: BarcodeConfig): Promise<string> => {
  if (!item.valid) return '';

  const canvas = document.createElement('canvas');
  
  // Calculate high-resolution dimensions in pixels for the source image
  const widthPx = convertToPx(config.width, config.unit, RENDER_DPI);
  const heightPx = convertToPx(config.height, config.unit, RENDER_DPI);
  const marginPx = convertToPx(config.margin, config.unit, RENDER_DPI);

  try {
    if (config.format === BarcodeFormat.QR) {
      return await QRCode.toDataURL(item.data, {
        width: widthPx,
        margin: Math.round(marginPx / (widthPx / 50)), // Relative margin adjustment
        color: {
          dark: config.barcodeColor,
          light: config.backgroundColor,
        },
        errorCorrectionLevel: 'H', 
      });
    } else {
      // Calculate a module width (bar size) that fills the canvas
      // Code 128 usually has ~11 modules per character. 
      // We aim for the highest resolution possible.
      const moduleWidth = Math.max(1, Math.floor((widthPx - marginPx * 2) / 150)); 

      JsBarcode(canvas, item.data, {
        format: config.format,
        width: moduleWidth, 
        height: heightPx - marginPx * 2, // Accounting for canvas padding
        displayValue: config.displayText,
        fontSize: Math.round(config.fontSize * (RENDER_DPI / 72)), 
        background: config.backgroundColor,
        lineColor: config.barcodeColor,
        margin: marginPx,
        text: item.label || item.data,
        textAlign: 'center',
        textMargin: 5,
        flat: true 
      });
      
      return canvas.toDataURL('image/png', 1.0);
    }
  } catch (e) {
    console.error('Render failure:', e);
    return '';
  }
};
