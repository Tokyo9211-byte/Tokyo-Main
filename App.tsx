
import React, { useState, useReducer, useMemo, useEffect, useCallback } from 'react';
import { 
  BarcodeFormat, 
  Unit, 
  BarcodeConfig, 
  BarcodeItem, 
  PageSetup,
  LabelTemplate,
  PageSizeType
} from './types';
import { 
  FORMAT_GROUPS, 
  DPI_OPTIONS,
  LABEL_TEMPLATES,
  PAGE_SIZES
} from './constants';
import { 
  validateBarcode, 
  renderBarcodeToDataUrl 
} from './services/barcodeGenerator';
import { 
  exportAsZip, 
  exportAsPdf,
  calculateGrid
} from './services/exportService';
import { 
  Layout, 
  Settings, 
  Download, 
  Plus, 
  Trash2, 
  Upload, 
  Search, 
  FileText, 
  Layers, 
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Copy,
  Printer,
  TableProperties,
  ArrowRight
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

type Action = 
  | { type: 'ADD_BATCH'; payload: BarcodeItem[] }
  | { type: 'DELETE_IDS'; payload: string[] }
  | { type: 'CLEAR_ALL' }
  | { type: 'RESTORE'; payload: BarcodeItem[] };

function barcodesReducer(state: BarcodeItem[], action: Action): BarcodeItem[] {
  switch (action.type) {
    case 'ADD_BATCH':
      const lastIndex = state.length > 0 ? state[state.length - 1].index : 0;
      const newItems = action.payload.map((item, i) => ({ ...item, index: lastIndex + i + 1 }));
      return [...state, ...newItems];
    case 'DELETE_IDS':
      const remaining = state.filter(item => !action.payload.includes(item.id));
      return remaining.map((item, i) => ({ ...item, index: i + 1 }));
    case 'CLEAR_ALL':
      return [];
    case 'RESTORE':
      return action.payload;
    default:
      return state;
  }
}

const STORAGE_KEY = 'barcode_pro_session_v2';

const App: React.FC = () => {
  const [barcodes, dispatch] = useReducer(barcodesReducer, []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'manual' | 'file' | 'batch' | 'range'>('manual');
  const [filterType, setFilterType] = useState<'all' | 'valid' | 'invalid'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  
  const [config, setConfig] = useState<BarcodeConfig>({
    format: BarcodeFormat.CODE128,
    width: 2.5,
    height: 1.0,
    margin: 0.1,
    unit: Unit.IN,
    dpi: 300,
    displayText: true,
    fontSize: 12,
    barcodeColor: '#000000',
    backgroundColor: '#ffffff',
    textColor: '#000000',
  });

  const [pageSetup, setPageSetup] = useState<PageSetup>({
    pageSize: 'Letter',
    width: 8.5,
    height: 11,
    unit: Unit.IN,
    orientation: 'portrait',
    marginTop: 0.5,
    marginBottom: 0.5,
    marginLeft: 0.5,
    marginRight: 0.5,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  
  const [rangeParams, setRangeParams] = useState({ prefix: 'PROD-', start: 1, end: 100, suffix: '' });
  const [manualInput, setManualInput] = useState('');
  const [batchInput, setBatchInput] = useState('');
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) dispatch({ type: 'RESTORE', payload: parsed });
      } catch (e) { console.error('Failed to restore session'); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(barcodes));
  }, [barcodes]);

  const addBarcodes = useCallback((dataList: string[]) => {
    const newItems: BarcodeItem[] = dataList.map(data => {
      const validation = validateBarcode(data, config.format);
      return {
        id: Math.random().toString(36).substr(2, 9),
        data,
        valid: validation.valid,
        error: validation.error,
        index: 0
      };
    });
    dispatch({ type: 'ADD_BATCH', payload: newItems });
  }, [config.format]);

  const handleManualAdd = () => {
    if (manualInput.trim()) {
      addBarcodes([manualInput.trim()]);
      setManualInput('');
    }
  };

  const handleBatchAdd = () => {
    const codes = batchInput.split('\n').map(s => s.trim()).filter(Boolean);
    if (codes.length) {
      addBarcodes(codes);
      setBatchInput('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessingMsg(`Reading ${file.name}...`);

    const reader = new FileReader();
    
    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setProcessingMsg('Processing records...');
          const codes = (results.data as any[]).flatMap(row => {
            const code = row.code || row.barcode || row.data || Object.values(row)[0];
            const qty = parseInt(row.quantity || row.qty || '1');
            return Array(isNaN(qty) ? 1 : Math.min(qty, 1000)).fill(String(code));
          });
          addBarcodes(codes);
          setIsProcessing(false);
          e.target.value = '';
        }
      });
    } else {
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);
          
          setProcessingMsg('Processing spreadsheet records...');
          const codes = (data as any[]).flatMap(row => {
            const code = row.code || row.barcode || row.data || Object.values(row)[0];
            const qty = parseInt(row.quantity || row.qty || '1');
            return Array(isNaN(qty) ? 1 : Math.min(qty, 1000)).fill(String(code));
          });
          addBarcodes(codes);
        } catch (error) {
          console.error('Spreadsheet read error', error);
          alert('Failed to read spreadsheet file.');
        } finally {
          setIsProcessing(false);
          e.target.value = '';
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleRangeGenerate = () => {
    const list: string[] = [];
    const count = Math.min(Math.max(0, rangeParams.end - rangeParams.start + 1), 5000);
    for (let i = rangeParams.start; i <= rangeParams.start + count - 1; i++) {
      list.push(`${rangeParams.prefix}${i}${rangeParams.suffix}`);
    }
    addBarcodes(list);
  };

  const filteredBarcodes = useMemo(() => {
    let result = barcodes.filter(b => 
      b.data.toLowerCase().includes(searchQuery.toLowerCase()) || 
      b.label?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filterType === 'valid') result = result.filter(b => b.valid);
    if (filterType === 'invalid') result = result.filter(b => !b.valid);
    return result;
  }, [barcodes, searchQuery, filterType]);

  const stats = useMemo(() => ({
    total: barcodes.length,
    valid: barcodes.filter(b => b.valid).length,
    invalid: barcodes.filter(b => !b.valid).length,
  }), [barcodes]);

  const totalPages = Math.ceil(filteredBarcodes.length / itemsPerPage);
  const paginatedBarcodes = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredBarcodes.slice(start, start + itemsPerPage);
  }, [filteredBarcodes, currentPage]);

  const handleExportZip = async () => {
    setExportProgress(0);
    await exportAsZip(barcodes, config, (p) => setExportProgress(p));
    setExportProgress(null);
  };

  const handleExportPdf = async () => {
    setExportProgress(0);
    await exportAsPdf(barcodes, config, pageSetup, (p) => setExportProgress(p));
    setExportProgress(null);
  };

  const handlePageSizeChange = (size: PageSizeType) => {
    const dimensions = PAGE_SIZES[size];
    setPageSetup({
      ...pageSetup,
      pageSize: size,
      width: dimensions.width,
      height: dimensions.height,
      unit: dimensions.unit,
      template: undefined
    });
  };

  const deleteBarcode = (id: string) => {
    dispatch({ type: 'DELETE_IDS', payload: [id] });
    const next = new Set(selectedIds);
    next.delete(id);
    setSelectedIds(next);
  };

  const deleteSelected = () => {
    dispatch({ type: 'DELETE_IDS', payload: Array.from(selectedIds) });
    setSelectedIds(new Set());
  };

  // Real-time grid capacity information
  const gridInfo = useMemo(() => {
    return calculateGrid(pageSetup, config);
  }, [pageSetup, config]);

  const capacityPerSheet = gridInfo.cols * gridInfo.rows;
  const estimatedTotalSheets = Math.ceil(stats.valid / capacityPerSheet) || 0;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-indigo-700 text-white p-4 shadow-lg flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1.5 rounded-lg shadow-sm">
            <Layout className="text-indigo-700" size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Bulk Barcode Pro</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold opacity-70">Total</p>
              <p className="text-sm font-bold">{stats.total}</p>
            </div>
            <div className="text-center text-green-300">
              <p className="text-[10px] uppercase font-bold opacity-70">Valid</p>
              <p className="text-sm font-bold">{stats.valid}</p>
            </div>
            <div className="text-center text-red-300">
              <p className="text-[10px] uppercase font-bold opacity-70">Invalid</p>
              <p className="text-sm font-bold">{stats.invalid}</p>
            </div>
          </div>
          <button 
            onClick={() => dispatch({ type: 'CLEAR_ALL' })}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md active:scale-95"
          >
            <RotateCcw size={16} /> New Session
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-[420px] border-r bg-white overflow-y-auto custom-scrollbar shadow-inner z-10">
          <div className="p-6 space-y-8">
            <section className="space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Plus size={14} /> Data Input
              </h2>
              
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {[
                  { id: 'manual', label: 'Manual' },
                  { id: 'file', label: 'Import' },
                  { id: 'batch', label: 'Bulk' },
                  { id: 'range', label: 'Range' }
                ].map((tab) => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all uppercase tracking-wider ${activeTab === tab.id ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >{tab.label}</button>
                ))}
              </div>

              <div className="min-h-[140px]">
                {activeTab === 'manual' && (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                      placeholder="Single code entry..."
                      className="flex-1 px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all"
                    />
                    <button onClick={handleManualAdd} className="bg-indigo-600 text-white px-4 rounded-xl hover:bg-indigo-700 transition-colors shadow-md active:scale-95">
                      <Plus size={20} />
                    </button>
                  </div>
                )}

                {activeTab === 'batch' && (
                  <div className="space-y-3">
                    <textarea 
                      value={batchInput}
                      onChange={(e) => setBatchInput(e.target.value)}
                      placeholder="Enter codes one per line..."
                      className="w-full h-32 px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm resize-none transition-all"
                    />
                    <button onClick={handleBatchAdd} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-md active:scale-95">
                      Add to List
                    </button>
                  </div>
                )}

                {activeTab === 'file' && (
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-indigo-400 transition-all group cursor-pointer relative bg-gray-50 hover:bg-white">
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <TableProperties className="mx-auto text-gray-400 group-hover:text-indigo-500 mb-4 transition-transform group-hover:scale-110" size={40} />
                    <p className="text-sm font-bold text-gray-700">Import CSV / Excel</p>
                    <p className="text-[10px] text-gray-400 mt-2 leading-relaxed px-4">Supports SKU list with quantity mapping.</p>
                  </div>
                )}

                {activeTab === 'range' && (
                  <div className="space-y-4 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                    <div className="grid grid-cols-2 gap-3">
                      <InputGroup label="Prefix" value={rangeParams.prefix} onChange={v => setRangeParams({...rangeParams, prefix: v})} />
                      <InputGroup label="Suffix" value={rangeParams.suffix} onChange={v => setRangeParams({...rangeParams, suffix: v})} />
                      <InputGroup label="Start" type="number" value={rangeParams.start} onChange={v => setRangeParams({...rangeParams, start: parseInt(v) || 0})} />
                      <InputGroup label="End" type="number" value={rangeParams.end} onChange={v => setRangeParams({...rangeParams, end: parseInt(v) || 0})} />
                    </div>
                    <button onClick={handleRangeGenerate} className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg active:scale-95 transition-all">
                      Generate Range
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4 border-t pt-6">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Settings size={14} /> Barcode Settings
              </h2>
              <div className="space-y-4">
                <SelectGroup label="Barcode Type" value={config.format} onChange={v => setConfig({...config, format: v as BarcodeFormat})}>
                  {FORMAT_GROUPS.map(group => (
                    <optgroup key={group.name} label={group.name}>
                      {group.formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </optgroup>
                  ))}
                </SelectGroup>

                <div className="grid grid-cols-2 gap-4">
                  <InputGroup label={`Width (${config.unit})`} type="number" step="0.01" value={config.width} onChange={v => setConfig({...config, width: parseFloat(v) || 0})} />
                  <InputGroup label={`Height (${config.unit})`} type="number" step="0.01" value={config.height} onChange={v => setConfig({...config, height: parseFloat(v) || 0})} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <SelectGroup label="Measurement Unit" value={config.unit} onChange={v => setConfig({...config, unit: v as Unit})}>
                    {Object.values(Unit).map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                  </SelectGroup>
                  <SelectGroup label="Print Resolution" value={config.dpi} onChange={v => setConfig({...config, dpi: parseInt(v)})}>
                    {DPI_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </SelectGroup>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-xs font-bold text-gray-600 uppercase">Show Label Text</span>
                  <input type="checkbox" checked={config.displayText} onChange={e => setConfig({...config, displayText: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded cursor-pointer" />
                </div>
              </div>
            </section>

            <section className="space-y-4 pt-6 border-t">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Printer size={14} /> Print Layout Optimization
              </h2>
              
              <div className="space-y-4">
                <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-inner space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold border-b border-indigo-500 pb-2 mb-2">
                    <span className="uppercase opacity-80">Grid Capacity</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded uppercase">{pageSetup.pageSize} {pageSetup.orientation}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase opacity-70 font-black">Layout</p>
                      <p className="text-lg font-black">{gridInfo.cols} × {gridInfo.rows}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase opacity-70 font-black">Per Sheet</p>
                      <p className="text-lg font-black">{capacityPerSheet}</p>
                    </div>
                  </div>
                  {stats.valid > 0 && (
                    <div className="pt-2 flex items-center gap-2 text-[10px] font-bold border-t border-indigo-500">
                      <ArrowRight size={10} />
                      <span>{estimatedTotalSheets} total sheets required for all valid barcodes</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <SelectGroup 
                    label="Page Size" 
                    value={pageSetup.pageSize} 
                    onChange={v => handlePageSizeChange(v as PageSizeType)}
                  >
                    {Object.keys(PAGE_SIZES).map(size => <option key={size} value={size}>{size}</option>)}
                  </SelectGroup>
                  <SelectGroup 
                    label="Orientation" 
                    value={pageSetup.orientation} 
                    onChange={v => setPageSetup({...pageSetup, orientation: v as 'portrait' | 'landscape'})}
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </SelectGroup>
                </div>

                <SelectGroup 
                  label="Label Template (Overrides Custom)" 
                  value={pageSetup.template?.name || ''} 
                  onChange={v => {
                    const t = LABEL_TEMPLATES.find(l => l.name === v);
                    setPageSetup({...pageSetup, template: t});
                  }}
                >
                  <option value="">Custom Optimized Grid</option>
                  {LABEL_TEMPLATES.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </SelectGroup>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button onClick={handleExportZip} className="flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 py-3 rounded-xl text-xs font-bold border border-indigo-100 hover:bg-indigo-100 transition-all shadow-sm">
                    <Layers size={16} /> ZIP (Images)
                  </button>
                  <button onClick={handleExportPdf} className="flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md transition-all active:scale-95">
                    <FileText size={16} /> Export PDF
                  </button>
                </div>
              </div>
            </section>
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-gray-100/30">
          <div className="bg-white border-b p-4 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text"
                  placeholder="Search barcodes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner bg-gray-50 transition-all"
                />
              </div>
              <div className="flex bg-gray-100 p-1 rounded-full shadow-inner">
                {['all', 'valid', 'invalid'].map((f) => (
                  <button 
                    key={f}
                    onClick={() => setFilterType(f as any)}
                    className={`px-4 py-1.5 text-[10px] font-bold rounded-full transition-all uppercase tracking-tighter ${filterType === f ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >{f}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 border bg-gray-50 rounded-xl p-1 shadow-sm">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-2 disabled:opacity-30 hover:bg-white rounded-lg transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="text-xs font-bold text-gray-500 min-w-[80px] text-center">Page {currentPage} / {Math.max(1, totalPages)}</span>
                <button 
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-2 disabled:opacity-30 hover:bg-white rounded-lg transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              {selectedIds.size > 0 && (
                <button 
                  onClick={deleteSelected}
                  className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-red-100"
                >
                  <Trash2 size={16} /> Delete Selected ({selectedIds.size})
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {filteredBarcodes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-300 space-y-6">
                <div className="bg-white p-10 rounded-full shadow-lg border border-gray-100">
                  <RotateCcw size={80} strokeWidth={1} className="text-indigo-200" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-2xl font-bold text-gray-400">Ready for data entry</p>
                  <p className="text-gray-400 text-sm max-w-xs">Upload a CSV/Excel file or add codes manually to start generating industry-standard barcodes.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 pb-10">
                {paginatedBarcodes.map((barcode) => (
                  <BarcodeCard 
                    key={barcode.id}
                    item={barcode}
                    config={config}
                    isSelected={selectedIds.has(barcode.id)}
                    onToggleSelect={() => {
                      const next = new Set(selectedIds);
                      if (next.has(barcode.id)) next.delete(barcode.id);
                      else next.add(barcode.id);
                      setSelectedIds(next);
                    }}
                    onDelete={() => deleteBarcode(barcode.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Overlays */}
      {isProcessing && (
        <div className="fixed inset-0 bg-indigo-900/40 backdrop-blur-sm flex items-center justify-center z-[110]">
          <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-sm w-full space-y-6 text-center">
            <div className="flex justify-center">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="space-y-1">
              <p className="text-xl font-black text-gray-800 tracking-tight">Processing Data</p>
              <p className="text-sm font-medium text-gray-500">{processingMsg}</p>
            </div>
          </div>
        </div>
      )}

      {exportProgress !== null && (
        <div className="fixed inset-0 bg-indigo-900/40 backdrop-blur-md flex items-center justify-center z-[120]">
          <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-sm w-full space-y-6 text-center transform scale-105">
            <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden shadow-inner">
              <div className="absolute inset-y-0 left-0 bg-indigo-600 transition-all duration-500 rounded-full" style={{ width: `${exportProgress}%` }}></div>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-black text-gray-800 tracking-tight">Generating Files</p>
              <p className="text-sm font-bold text-indigo-500">{exportProgress}% Complete</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InputGroup: React.FC<{ label: string; type?: string; value: any; onChange: (v: string) => void; step?: string }> = ({ label, type = 'text', value, onChange, step }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>
    <input type={type} step={step} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm bg-gray-50/50" />
  </div>
);

const SelectGroup: React.FC<{ label: string; value: any; onChange: (v: string) => void; children: React.ReactNode }> = ({ label, value, onChange, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all bg-white shadow-sm cursor-pointer">
      {children}
    </select>
  </div>
);

const BarcodeCard: React.FC<{ 
  item: BarcodeItem; 
  config: BarcodeConfig; 
  isSelected: boolean; 
  onToggleSelect: () => void;
  onDelete: () => void;
}> = ({ item, config, isSelected, onToggleSelect, onDelete }) => {
  const [dataUrl, setDataUrl] = useState('');
  
  useEffect(() => {
    if (item.valid) {
      renderBarcodeToDataUrl(item, config).then(setDataUrl);
    }
  }, [item, config]);

  return (
    <div 
      className={`group relative bg-white rounded-3xl border-2 transition-all p-6 cursor-pointer hover:shadow-2xl hover:-translate-y-2 ${isSelected ? 'border-indigo-500 ring-8 ring-indigo-50' : 'border-white shadow-xl shadow-indigo-100/20'}`}
      onClick={onToggleSelect}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">ID: {item.index}</span>
        <div className="flex items-center gap-2">
          {item.valid ? (
            <CheckCircle2 size={18} className="text-green-500" />
          ) : (
            <XCircle size={18} className="text-red-500" />
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-gray-300 hover:text-red-500 transition-colors p-1"
            title="Remove barcode"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center min-h-[140px] bg-gray-50/50 rounded-2xl p-4 overflow-hidden border border-gray-100 transition-colors group-hover:bg-white relative">
        {item.valid ? (
          dataUrl ? (
            <img src={dataUrl} alt={item.data} className="max-w-full h-auto object-contain transition-transform group-hover:scale-105" />
          ) : (
            <div className="animate-pulse w-40 h-20 bg-gray-200/50 rounded-xl" />
          )
        ) : (
          <div className="text-center p-4">
            <AlertTriangle className="mx-auto text-amber-500 mb-3" size={32} />
            <p className="text-[11px] text-red-500 font-bold leading-tight px-4">{item.error || 'Invalid Format'}</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="truncate flex-1">
          <p className="text-sm font-black text-gray-800 truncate tracking-tight">{item.data}</p>
          <p className="text-[10px] text-gray-400 mt-1 font-bold uppercase tracking-wider">{config.format}</p>
        </div>
        <div className={`p-2 rounded-full transition-all shadow-sm ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-400'}`}>
          {isSelected ? <CheckCircle2 size={16} /> : <Copy size={16} />}
        </div>
      </div>
    </div>
  );
};

export default App;
