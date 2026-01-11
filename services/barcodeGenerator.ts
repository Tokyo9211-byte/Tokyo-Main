
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { BarcodeFormat, BarcodeConfig, BarcodeItem, Unit } from '../types';
import { convertToPx } from './unitConverter';

export const validateBarcode = (data: string, format: BarcodeFormat): { valid: boolean; error?: string } => {
  if (!data) return { valid: false, error: 'Empty data' };

  switch (format) {
    case BarcodeFormat.EAN13:
      return /^\d{12,13}$/.test(data) ? { valid: true } : { valid: false, error: 'EAN-13 must be 12-13 digits' };
    case BarcodeFormat.EAN8:
      return /^\d{7,8}$/.test(data) ? { valid: true } : { valid: false, error: 'EAN-8 must be 7-8 digits' };
    case BarcodeFormat.UPCA:
      return /^\d{11,12}$/.test(data) ? { valid: true } : { valid: false, error: 'UPC-A must be 11-12 digits' };
    case BarcodeFormat.QR:
      return { valid: true };
    default:
      return { valid: true };
  }
};

export const renderBarcodeToDataUrl = async (item: BarcodeItem, config: BarcodeConfig): Promise<string> => {
  if (!item.valid) return '';

  const canvas = document.createElement('canvas');
  const widthPx = convertToPx(config.width, config.unit, config.dpi);
  const heightPx = convertToPx(config.height, config.unit, config.dpi);
  const marginPx = convertToPx(config.margin, config.unit, config.dpi);

  try {
    if (config.format === BarcodeFormat.QR) {
      return await QRCode.toDataURL(item.data, {
        width: widthPx,
        margin: marginPx,
        color: {
          dark: config.barcodeColor,
          light: config.backgroundColor,
        },
      });
    } else {
      JsBarcode(canvas, item.data, {
        format: config.format,
        width: Math.max(1, widthPx / 100), // JsBarcode width is a factor
        height: heightPx,
        displayValue: config.displayText,
        fontSize: config.fontSize,
        background: config.backgroundColor,
        lineColor: config.barcodeColor,
        margin: marginPx,
        text: item.label || item.data,
      });
      return canvas.toDataURL('image/png');
    }
  } catch (e) {
    console.error('Barcode render error', e);
    return '';
  }
};
