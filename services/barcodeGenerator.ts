
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { BarcodeFormat, BarcodeConfig, BarcodeItem } from '../types';
import { convertToPx } from './unitConverter';

/**
 * 600 DPI is the industry standard for high-fidelity professional printing.
 * 24000 DPI (or even 2400) creates canvases that exceed browser memory limits (billions of pixels).
 * At 600 DPI, a 2"x1" label is 1200x600px, which is perfect for crisp thermal or laser printing.
 */
const RENDER_DPI = 600;

export const validateBarcode = (data: string, format: BarcodeFormat): { valid: boolean; error?: string } => {
  if (!data) return { valid: false, error: 'Empty input' };

  try {
    switch (format) {
      case BarcodeFormat.EAN13:
        return /^\d{12,13}$/.test(data) ? { valid: true } : { valid: false, error: 'EAN-13: Requires 12-13 digits' };
      case BarcodeFormat.EAN8:
        return /^\d{7,8}$/.test(data) ? { valid: true } : { valid: false, error: 'EAN-8: Requires 7-8 digits' };
      case BarcodeFormat.UPCA:
        return /^\d{11,12}$/.test(data) ? { valid: true } : { valid: false, error: 'UPC-A: Requires 11-12 digits' };
      case BarcodeFormat.ITF14:
        return /^\d{13,14}$/.test(data) ? { valid: true } : { valid: false, error: 'ITF-14: Requires 13-14 digits' };
      case BarcodeFormat.PHARMACODE:
        const n = parseInt(data);
        return (!isNaN(n) && n >= 3 && n <= 131071) ? { valid: true } : { valid: false, error: 'Pharma: Range 3-131071' };
      case BarcodeFormat.QR:
        return data.length > 0 ? { valid: true } : { valid: false, error: 'QR: Content required' };
      default:
        return { valid: true };
    }
  } catch (e) {
    return { valid: false, error: 'Validation failed' };
  }
};

export const renderBarcodeToDataUrl = async (item: BarcodeItem, config: BarcodeConfig): Promise<string> => {
  if (!item.valid) return '';

  const canvas = document.createElement('canvas');
  
  // High-precision dimension calculation
  const widthPx = convertToPx(config.width, config.unit, RENDER_DPI);
  const heightPx = convertToPx(config.height, config.unit, RENDER_DPI);
  const marginPx = convertToPx(config.margin, config.unit, RENDER_DPI);

  try {
    if (config.format === BarcodeFormat.QR) {
      return await QRCode.toDataURL(item.data, {
        width: widthPx,
        margin: Math.max(1, Math.round(marginPx / (widthPx / 50))),
        color: {
          dark: config.barcodeColor,
          light: config.backgroundColor,
        },
        errorCorrectionLevel: 'H', 
      });
    } else {
      // JsBarcode automatically calculates bar widths. 
      // We set 'width' as the width of a single bar (module). 
      // For high DPI, we scale this module width accordingly.
      const estimatedModules = 100; // Typical for Code128
      const moduleWidth = Math.max(1, Math.floor((widthPx - (marginPx * 2)) / estimatedModules));

      JsBarcode(canvas, item.data, {
        format: config.format,
        width: moduleWidth, 
        height: heightPx - (marginPx * 2) - (config.displayText ? Math.round(config.fontSize * 1.5) : 0),
        displayValue: config.displayText,
        fontSize: Math.round(config.fontSize * (RENDER_DPI / 72)), 
        background: config.backgroundColor,
        lineColor: config.barcodeColor,
        margin: marginPx,
        text: item.label || item.data,
        textAlign: 'center',
        textMargin: 4,
        flat: true 
      });
      
      const result = canvas.toDataURL('image/png', 1.0);
      // Explicitly clear canvas to free memory in batch operations
      canvas.width = 0;
      canvas.height = 0;
      return result;
    }
  } catch (e) {
    console.error('Barcode Render Error:', e);
    return '';
  }
};
