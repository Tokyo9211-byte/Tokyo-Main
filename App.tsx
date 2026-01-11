
import React, { useState, useReducer, useMemo, useEffect, useCallback } from 'react';
import { 
  BarcodeFormat, 
  Unit, 
  BarcodeConfig, 
  BarcodeItem, 
  PageSetup,
  PageSizeType
} from './types';
import { 
  FORMAT_GROUPS, 
  DPI_OPTIONS,
  LABEL_TEMPLATES,
  PAGE_SIZES,
  UNIT_FACTORS
} from './constants';
import { 
  validateBarcode, 
  renderBarcodeToDataUrl 
} from './services/barcodeGenerator';
import { 
  exportAsZip, 
  exportAsPdf,
  calculateGrid,
  GridResult
} from './services/exportService';
import { 
  Layout, Settings, Plus, Trash2, Search, FileText, Layers, 
  CheckCircle2, XCircle, AlertTriangle, ChevronLeft, ChevronRight, 
  RotateCcw, Copy, Printer, TableProperties, Grid as GridIcon,
  Sparkles, TrendingUp, Info
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
    case 'CLEAR_ALL': return [];
    case 'RESTORE': return action.payload;
    default: return state;
  }
}

const STORAGE_KEY = 'barcode_industrial_v5_pro';

const App: React.FC = () => {
  const [barcodes, dispatch] = useReducer(barcodesReducer, []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'manual' | 'file' | 'batch' | 'range'>('manual');
  const [filterType, setFilterType] = useState<'all' | 'valid' | 'invalid'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  const [config, setConfig] = useState<BarcodeConfig>({
    format: BarcodeFormat.CODE128,
    width: 2.0,
    height: 1.0,
    margin: 0.1,
    unit: Unit.IN,
    dpi: 300,
    displayText: true,
    fontSize: 10,
    barcodeColor: '#000000',
    backgroundColor: '#ffffff',
    textColor: '#000000',
  });

  const [pageSetup, setPageSetup] = useState<PageSetup>({
    pageSize: 'A4',
    width: 210,
    height: 297,
    unit: Unit.MM,
    orientation: 'portrait',
    marginTop: 10,
    marginBottom: 10,
    marginLeft: 10,
    marginRight: 10,
    gutter: 2
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) dispatch({ type: 'RESTORE', payload: parsed });
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(barcodes));
  }, [barcodes]);

  const addBarcodes = useCallback((dataList: string[]) => {
    const newItems: BarcodeItem[] = dataList.map(data => {
      const v = validateBarcode(data, config.format);
      return { id: Math.random().toString(36).substr(2, 9), data, valid: v.valid, error: v.error, index: 0 };
    });
    dispatch({ type: 'ADD_BATCH', payload: newItems });
  }, [config.format]);

  const grid = useMemo(() => calculateGrid(pageSetup, config), [pageSetup, config]);

  const filteredBarcodes = useMemo(() => {
    let res = barcodes.filter(b => b.data.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterType === 'valid') res = res.filter(b => b.valid);
    if (filterType === 'invalid') res = res.filter(b => !b.valid);
    return res;
  }, [barcodes, searchQuery, filterType]);

  const stats = useMemo(() => ({
    total: barcodes.length,
    valid: barcodes.filter(b => b.valid).length,
    invalid: barcodes.filter(b => !b.valid).length,
    totalPages: Math.ceil(filteredBarcodes.length / itemsPerPage)
  }), [barcodes, filteredBarcodes]);

  const paginatedBarcodes = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredBarcodes.slice(start, start + itemsPerPage);
  }, [filteredBarcodes, currentPage]);

  const handleExportPdf = async () => {
    if (stats.valid === 0) {
      alert("No valid barcodes to export.");
      return;
    }
    setExportProgress(0);
    await exportAsPdf(barcodes, config, pageSetup, setExportProgress);
    setExportProgress(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFC] font-sans">
      <header className="bg-slate-900 text-white px-8 py-5 shadow-2xl flex items-center justify-between z-40 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-600/30">
            <Layout size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter uppercase italic leading-none">Industrial <span className="text-indigo-400">Barcode</span></h1>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Precision Batch Controller v5.0</p>
          </div>
        </div>
        
        <div className="flex items-center gap-10">
          <div className="hidden lg:flex gap-8 border-l border-slate-700 pl-8">
            <HeaderStat label="BATCH SIZE" value={stats.total} />
            <HeaderStat label="VERIFIED" value={stats.valid} color="text-emerald-400" />
            <HeaderStat label="ALERT" value={stats.invalid} color="text-rose-400" />
          </div>
          <button onClick={() => dispatch({ type: 'CLEAR_ALL' })} className="bg-slate-800 hover:bg-rose-900/40 hover:text-rose-400 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-slate-700 active:scale-95">
            Reset System
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-[460px] border-r bg-white overflow-y-auto custom-scrollbar shadow-xl z-20">
          <div className="p-8 space-y-10 pb-40">
            {/* Input Dashboard */}
            <section className="space-y-6">
              <SectionHeader icon={<Plus size={16}/>} title="Data Ingestion" />
              <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                {['manual', 'file', 'batch', 'range'].map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-2.5 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${activeTab === tab ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>{tab}</button>
                ))}
              </div>
              <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100">
                {activeTab === 'manual' && <ManualInput onAdd={(v) => addBarcodes([v])} />}
                {activeTab === 'batch' && <BatchInput onAdd={(list) => addBarcodes(list)} />}
                {activeTab === 'file' && <FileInput onAdd={(list) => addBarcodes(list)} setIsProcessing={setIsProcessing} setMsg={setProcessingMsg} />}
                {activeTab === 'range' && <RangeInput onAdd={(list) => addBarcodes(list)} />}
              </div>
            </section>

            {/* Symbology Config */}
            <section className="space-y-6 pt-10 border-t border-slate-100">
              <SectionHeader icon={<Settings size={16}/>} title="Symbology Parameters" />
              <div className="grid gap-6">
                <SelectGroup label="Standard Symbology" value={config.format} onChange={v => setConfig({...config, format: v as BarcodeFormat})}>
                  {FORMAT_GROUPS.map(g => <optgroup key={g.name} label={g.name}>{g.formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>)}
                </SelectGroup>
                <div className="grid grid-cols-2 gap-4">
                  <UnitInput label="Width" value={config.width} unit={config.unit} onChange={v => setConfig({...config, width: v})} onUnitChange={u => setConfig({...config, unit: u})} />
                  <UnitInput label="Height" value={config.height} unit={config.unit} onChange={v => setConfig({...config, height: v})} onUnitChange={u => setConfig({...config, unit: u})} />
                </div>
              </div>
            </section>

            {/* Layout Engine */}
            <section className="space-y-8 pt-10 border-t border-slate-100">
              <SectionHeader icon={<Printer size={16}/>} title="Page Architecture" />
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <SelectGroup label="Base Format" value={pageSetup.pageSize} onChange={v => {
                    const dims = PAGE_SIZES[v as PageSizeType];
                    setPageSetup({...pageSetup, pageSize: v as PageSizeType, width: dims.width, height: dims.height, unit: dims.unit});
                  }}>
                    {Object.keys(PAGE_SIZES).map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectGroup>
                  <SelectGroup label="Orientation" value={pageSetup.orientation} onChange={v => setPageSetup({...pageSetup, orientation: v as any})}>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </SelectGroup>
                </div>

                <div className="space-y-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Printable Margins</p>
                  <div className="grid grid-cols-2 gap-4">
                    <UnitInput label="Top" value={pageSetup.marginTop} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, marginTop: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Bottom" value={pageSetup.marginBottom} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, marginBottom: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Left" value={pageSetup.marginLeft} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, marginLeft: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Right" value={pageSetup.marginRight} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, marginRight: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <UnitInput label="Item Gap" value={pageSetup.gutter} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, gutter: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                  <SelectGroup label="Grid Preset" value={pageSetup.template?.name || ''} onChange={v => setPageSetup({...pageSetup, template: LABEL_TEMPLATES.find(t => t.name === v)})}>
                    <option value="">Optimized Placement</option>
                    {LABEL_TEMPLATES.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </SelectGroup>
                </div>

                {/* Capacity Analysis */}
                <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border border-slate-800">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-600/40 transition-all duration-700"></div>
                  <div className="relative z-10 space-y-6">
                    <div className="flex justify-between items-center text-[10px] font-black border-b border-white/10 pb-4 mb-2 uppercase tracking-[0.2em]">
                      <span className="flex items-center gap-2"><Sparkles size={12} className="text-indigo-400"/> Capacity Suggestion</span>
                      <span className="bg-indigo-600/30 text-indigo-300 px-4 py-1.5 rounded-full">{grid.efficiency.toFixed(1)}% Usage</span>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Matrix</p>
                        <p className="text-3xl font-black">{grid.cols} <span className="text-slate-600">×</span> {grid.rows}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Total Capacity</p>
                        <p className="text-3xl font-black text-indigo-400">{grid.totalCapacity}</p>
                      </div>
                    </div>
                    {grid.suggestions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                         <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><TrendingUp size={12}/> Optimization Strategy</p>
                         {grid.suggestions.map((s, idx) => (
                           <p key={idx} className="text-[11px] font-medium leading-relaxed text-slate-300 italic flex gap-2">
                             <Info size={12} className="shrink-0 text-indigo-500" /> {s}
                           </p>
                         ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6">
                  <SectionHeader icon={<GridIcon size={14}/>} title="Live Placement Preview" />
                  <LiveProof grid={grid} pageSetup={pageSetup} config={config} />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-8">
                  <button onClick={async () => { setExportProgress(0); await exportAsZip(barcodes, config, setExportProgress); setExportProgress(null); }} className="flex items-center justify-center gap-3 bg-white text-slate-900 py-4.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-slate-100 hover:border-indigo-100 hover:text-indigo-600 transition-all shadow-xl active:scale-95">
                    <Layers size={18} /> PNG Archive
                  </button>
                  <button onClick={handleExportPdf} className="flex items-center justify-center gap-3 bg-indigo-600 text-white py-4.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-2xl shadow-indigo-600/30 transition-all active:scale-95">
                    <FileText size={18} /> Export PDF
                  </button>
                </div>
              </div>
            </section>
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-[#F4F6FB] overflow-hidden">
          <div className="bg-white border-b px-8 py-6 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-8 flex-1">
              <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                <input type="text" placeholder="Filter product batch..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-16 pr-8 py-4.5 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 shadow-inner bg-slate-50/50 transition-all font-bold" />
              </div>
              <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                {['all', 'valid', 'invalid'].map((f) => (
                  <button key={f} onClick={() => setFilterType(f as any)} className={`px-6 py-2.5 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${filterType === f ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>{f}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="p-3 disabled:opacity-20 hover:bg-slate-50 rounded-xl transition-all"><ChevronLeft size={22} /></button>
                <span className="text-[10px] font-black text-slate-400 min-w-[120px] text-center uppercase tracking-widest">Page {currentPage} of {Math.max(1, stats.totalPages)}</span>
                <button disabled={currentPage === stats.totalPages || stats.totalPages === 0} onClick={() => setCurrentPage(p => Math.min(stats.totalPages, p + 1))} className="p-3 disabled:opacity-20 hover:bg-slate-50 rounded-xl transition-all"><ChevronRight size={22} /></button>
              </div>
              {selectedIds.size > 0 && (
                <button onClick={() => { dispatch({ type: 'DELETE_IDS', payload: Array.from(selectedIds) }); setSelectedIds(new Set()); }} className="bg-rose-50 text-rose-600 hover:bg-rose-100 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-rose-100 flex items-center gap-3">
                  <Trash2 size={18} /> Delete ({selectedIds.size})
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
            {filteredBarcodes.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-10 pb-40">
                {paginatedBarcodes.map((b) => (
                  <BarcodeCard key={b.id} item={b} config={config} isSelected={selectedIds.has(b.id)} onToggle={() => {
                    const n = new Set(selectedIds);
                    if (n.has(b.id)) n.delete(b.id); else n.add(b.id);
                    setSelectedIds(n);
                  }} onDelete={() => { dispatch({ type: 'DELETE_IDS', payload: [b.id] }); const n = new Set(selectedIds); n.delete(b.id); setSelectedIds(n); }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {isProcessing && <Overlay title="Engine Processing" msg={processingMsg} loading />}
      {exportProgress !== null && <Overlay title="Industrial Rendering" msg={`Building PDF frames... ${exportProgress}%`} progress={exportProgress} />}
    </div>
  );
};

// UI Components

interface HeaderStatProps {
  label: string;
  value: string | number;
  color?: string;
}

const HeaderStat: React.FC<HeaderStatProps> = ({ label, value, color = "text-white" }) => (
  <div className="text-center group">
    <p className="text-[9px] font-black text-slate-500 group-hover:text-indigo-400 uppercase tracking-[0.3em] mb-1 transition-colors">{label}</p>
    <p className={`text-base font-black ${color}`}>{value}</p>
  </div>
);

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title }) => (
  <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
    <span className="bg-slate-100 p-1.5 rounded-lg text-slate-600">{icon}</span> {title}
  </h2>
);

interface SelectGroupProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}

const SelectGroup: React.FC<SelectGroupProps> = ({ label, value, onChange, children }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">{label}</label>
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all bg-white shadow-sm cursor-pointer font-bold appearance-none">
        {children}
      </select>
      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none opacity-30"><ChevronRight size={14} className="rotate-90"/></div>
    </div>
  </div>
);

interface UnitInputProps {
  label: string;
  value: number;
  unit: Unit;
  onChange: (v: number) => void;
  onUnitChange: (u: Unit) => void;
}

const UnitInput: React.FC<UnitInputProps> = ({ label, value, unit, onChange, onUnitChange }) => (
  <div className="space-y-2">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">{label}</label>
    <div className="flex shadow-sm rounded-2xl overflow-hidden border border-slate-200 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
      <input type="number" step="any" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} className="flex-1 w-full px-4 py-3 text-xs outline-none font-bold bg-white" />
      <select value={unit} onChange={e => onUnitChange(e.target.value as Unit)} className="bg-slate-50 border-l border-slate-200 px-3 py-3 text-[10px] font-black uppercase tracking-tighter cursor-pointer outline-none">
        {Object.values(Unit).map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
      </select>
    </div>
  </div>
);

const LiveProof: React.FC<{ grid: GridResult, pageSetup: PageSetup, config: BarcodeConfig }> = ({ grid, pageSetup, config }) => {
  const maxW = 340;
  const maxH = 260;
  
  // Guard for invalid grid
  if (!grid.pWidth || !grid.pHeight) return <div className="p-10 text-slate-300 italic text-xs">Invalid page setup</div>;

  const scale = Math.min(maxW / grid.pWidth, maxH / grid.pHeight);
  const vW = grid.pWidth * scale;
  const vH = grid.pHeight * scale;

  const scaleToPage = UNIT_FACTORS[pageSetup.unit] / UNIT_FACTORS[config.unit];
  const bW_page = config.width * scaleToPage;
  const bH_page = config.height * scaleToPage;
  const gut_page = grid.gutter;

  const actualGridW = grid.cols * bW_page + (grid.cols - 1) * gut_page;
  const actualGridH = grid.rows * bH_page + (grid.rows - 1) * gut_page;
  
  const xStart = grid.mLeft + (grid.pWidth - grid.mLeft - grid.mRight - actualGridW) / 2;
  const yStart = grid.mTop + (grid.pHeight - grid.mTop - grid.mBottom - actualGridH) / 2;

  const rects = [];
  if (grid.cols > 0 && grid.rows > 0) {
    for(let r=0; r < Math.min(grid.rows, 50); r++) {
      for(let c=0; c < Math.min(grid.cols, 50); c++) {
        rects.push(
          <rect 
            key={`${r}-${c}`} 
            x={(xStart + c * (bW_page + gut_page)) * scale} 
            y={(yStart + r * (bH_page + gut_page)) * scale} 
            width={bW_page * scale} 
            height={bH_page * scale} 
            className="fill-indigo-500/10 stroke-indigo-500/40 stroke-[0.5]" 
          />
        );
      }
    }
  }

  return (
    <div className="flex items-center justify-center bg-slate-50/50 rounded-[2.5rem] p-12 border border-slate-200/50 shadow-inner min-h-[300px]">
      <svg width={vW} height={vH} className="bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.1)] border border-slate-100 transition-all duration-500 overflow-visible rounded-sm">
        <rect 
          x={grid.mLeft * scale} 
          y={grid.mTop * scale} 
          width={(grid.pWidth - grid.mLeft - grid.mRight) * scale} 
          height={(grid.pHeight - grid.mTop - grid.mBottom) * scale} 
          className="fill-none stroke-slate-200 stroke-dashed stroke-[0.5]" 
        />
        {rects}
      </svg>
    </div>
  );
};

interface BarcodeCardProps {
  item: BarcodeItem;
  config: BarcodeConfig;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

const BarcodeCard: React.FC<BarcodeCardProps> = ({ item, config, isSelected, onToggle, onDelete }) => {
  const [url, setUrl] = useState('');
  useEffect(() => { 
    if (item.valid) {
      const timer = setTimeout(() => {
        renderBarcodeToDataUrl(item, config).then(setUrl);
      }, 50);
      return () => clearTimeout(timer);
    } 
  }, [item.data, item.valid, config]);

  return (
    <div className={`group relative bg-white rounded-[2.5rem] border-[3.5px] transition-all p-8 cursor-pointer hover:shadow-2xl hover:-translate-y-4 ${isSelected ? 'border-indigo-600 shadow-indigo-100' : 'border-transparent shadow-xl shadow-slate-200/30'}`} onClick={onToggle}>
      <div className="flex items-center justify-between mb-8">
        <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">LN_{item.index}</span>
        <div className="flex items-center gap-3">
          {item.valid ? <CheckCircle2 size={22} className="text-emerald-500" /> : <XCircle size={22} className="text-rose-500" />}
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="text-slate-200 hover:text-rose-600 transition-colors p-2.5 rounded-2xl hover:bg-rose-50"><Trash2 size={18} /></button>
        </div>
      </div>
      <div className="flex items-center justify-center min-h-[160px] bg-slate-50/50 rounded-[2.5rem] p-8 overflow-hidden border border-slate-100 group-hover:bg-white transition-all relative">
        {item.valid ? (url ? <img src={url} alt={item.data} className="max-w-full h-auto object-contain transition-transform group-hover:scale-110 drop-shadow-md" /> : <div className="animate-pulse w-full h-24 bg-slate-100 rounded-2xl" />) : <div className="text-center p-6"><AlertTriangle className="mx-auto text-amber-500 mb-4" size={44} /><p className="text-[10px] text-rose-500 font-black uppercase tracking-tighter leading-tight">{item.error || 'INVALID'}</p></div>}
      </div>
      <div className="mt-10 flex items-center justify-between gap-8">
        <div className="truncate flex-1">
          <p className="text-base font-black text-slate-900 truncate tracking-tight mb-1">{item.data}</p>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{config.format}</p>
        </div>
        <div className={`p-3.5 rounded-2xl shadow-lg transition-all ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-200 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>{isSelected ? <CheckCircle2 size={20} /> : <Copy size={20} />}</div>
      </div>
    </div>
  );
};

// Input Components

interface ManualInputProps { onAdd: (v: string) => void; }
const ManualInput: React.FC<ManualInputProps> = ({ onAdd }) => {
  const [val, setVal] = useState('');
  return (
    <div className="flex gap-4">
      <input type="text" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && (onAdd(val), setVal(''))} placeholder="Entry code..." className="flex-1 px-6 py-4 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-100/40 bg-white font-bold" />
      <button onClick={() => {if(val) onAdd(val); setVal('');}} className="bg-indigo-600 text-white px-8 rounded-2xl hover:bg-indigo-700 shadow-xl active:scale-90 transition-all"><Plus size={28}/></button>
    </div>
  );
};

interface BatchInputProps { onAdd: (list: string[]) => void; }
const BatchInput: React.FC<BatchInputProps> = ({ onAdd }) => {
  const [val, setVal] = useState('');
  return (
    <div className="space-y-4">
      <textarea value={val} onChange={e => setVal(e.target.value)} placeholder="One SKU per line..." className="w-full h-44 px-6 py-5 border border-slate-200 rounded-[2rem] text-sm focus:ring-4 focus:ring-indigo-100/40 bg-white font-bold resize-none custom-scrollbar" />
      <button onClick={() => {onAdd(val.split('\n').filter(Boolean)); setVal('');}} className="w-full bg-indigo-600 text-white py-4.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-2xl transition-all">Import List</button>
    </div>
  );
};

interface RangeInputProps { onAdd: (list: string[]) => void; }
const RangeInput: React.FC<RangeInputProps> = ({ onAdd }) => {
  const [p, setP] = useState({ pre: 'SKU-', start: 1, end: 50, suf: '' });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <InputGroupSimple label="Prefix" value={p.pre} onChange={v => setP({...p, pre: v})} />
        <InputGroupSimple label="Suffix" value={p.suf} onChange={v => setP({...p, suf: v})} />
        <InputGroupSimple label="Start" type="number" value={p.start} onChange={v => setP({...p, start: parseInt(v)})} />
        <InputGroupSimple label="End" type="number" value={p.end} onChange={v => setP({...p, end: parseInt(v)})} />
      </div>
      <button onClick={() => {
        const l = [];
        const limit = Math.min(p.end, p.start + 5000); 
        for(let i=p.start; i<=limit; i++) l.push(`${p.pre}${i}${p.suf}`);
        onAdd(l);
      }} className="w-full bg-indigo-600 text-white py-4.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl active:scale-95 transition-all">Generate Sequence</button>
    </div>
  );
};

interface FileInputProps { onAdd: (list: string[]) => void; setIsProcessing: (v: boolean) => void; setMsg: (v: string) => void; }
const FileInput: React.FC<FileInputProps> = ({ onAdd, setIsProcessing, setMsg }) => (
  <div className="border-3 border-dashed border-slate-200 rounded-[2.5rem] p-12 text-center hover:border-indigo-500 transition-all group relative bg-white hover:shadow-2xl">
    <input type="file" accept=".csv,.xlsx,.xls" onChange={async e => {
      const f = e.target.files?.[0]; if(!f) return;
      setIsProcessing(true); setMsg(`Parsing ${f.name}...`);
      if(f.name.endsWith('.csv')) {
        Papa.parse(f, { header: true, skipEmptyLines: true, complete: (r) => { 
          onAdd(r.data.flatMap(row => {
            const code = row.code || row.barcode || Object.values(row)[0];
            const qty = parseInt(row.quantity || '1') || 1;
            return Array(Math.min(qty, 1000)).fill(String(code));
          }));
          setIsProcessing(false); (e.target as HTMLInputElement).value = '';
        }});
      } else {
        const r = new FileReader(); r.onload = (ev) => {
          try {
            const wb = XLSX.read(ev.target?.result, {type:'binary'});
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.Sheets.SheetNames ? wb.Sheets.SheetNames[0] : Object.keys(wb.Sheets)[0]]);
            onAdd(data.flatMap((row: any) => {
              const code = row.code || row.barcode || Object.values(row)[0];
              const qty = parseInt(row.quantity || '1') || 1;
              return Array(Math.min(qty, 1000)).fill(String(code));
            }));
          } catch(err) { alert("Excel format error."); }
          setIsProcessing(false); (e.target as HTMLInputElement).value = '';
        }; r.readAsBinaryString(f);
      }
    }} className="absolute inset-0 opacity-0 cursor-pointer" />
    <TableProperties className="mx-auto text-slate-200 group-hover:text-indigo-500 mb-5 transition-all group-hover:scale-110" size={56} />
    <p className="text-base font-black text-slate-800">Drop Inventory List</p>
    <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest leading-relaxed">CSV or Excel support (Code/Qty columns)</p>
  </div>
);

const InputGroupSimple = ({ label, type = 'text', value, onChange }: any) => (
  <div className="space-y-2">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-indigo-50 transition-all bg-white font-bold" />
  </div>
);

const EmptyState: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center text-slate-300">
    <div className="bg-white p-14 rounded-[4rem] shadow-2xl mb-10 border border-slate-50 relative overflow-hidden group">
      <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
      <RotateCcw size={110} strokeWidth={1} className="text-slate-100 group-hover:text-indigo-200 transition-all duration-700 relative z-10 animate-[spin_30s_linear_infinite]" />
    </div>
    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Controller Idle</h3>
    <p className="text-slate-400 text-base mt-3 max-w-sm text-center font-medium leading-relaxed">No batch data loaded. Import inventory or generate SKU sequences to populate the queue.</p>
  </div>
);

interface OverlayProps { title: string; msg: string; loading?: boolean; progress?: number; }
const Overlay: React.FC<OverlayProps> = ({ title, msg, loading = false, progress = 0 }) => (
  <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center z-[200]">
    <div className="bg-white p-16 rounded-[4rem] shadow-2xl max-w-lg w-full space-y-12 text-center border border-white/20 animate-in fade-in zoom-in duration-300">
      {loading ? (
        <div className="flex justify-center"><div className="w-20 h-20 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner">
          <div className="absolute inset-y-0 left-0 bg-indigo-600 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>
      )}
      <div className="space-y-4">
        <p className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase">{title}</p>
        <p className="text-lg font-black text-indigo-600 uppercase tracking-widest leading-tight">{msg}</p>
      </div>
    </div>
  </div>
);

export default App;
