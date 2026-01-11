
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
  Sparkles, TrendingUp, Info, Type, Menu, X
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

const App: React.FC = () => {
  const [barcodes, dispatch] = useReducer(barcodesReducer, []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'manual' | 'file' | 'batch' | 'range'>('manual');
  const [filterType, setFilterType] = useState<'all' | 'valid' | 'invalid'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  const grid = useMemo(() => calculateGrid(pageSetup, config), [pageSetup, config]);

  const addBarcodes = useCallback((dataList: string[]) => {
    const newItems: BarcodeItem[] = dataList.map(data => {
      const v = validateBarcode(data, config.format);
      return { id: Math.random().toString(36).substr(2, 9), data, valid: v.valid, error: v.error, index: 0 };
    });
    dispatch({ type: 'ADD_BATCH', payload: newItems });
  }, [config.format]);

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
    if (stats.valid === 0) return alert("System Alert: No valid data to render.");
    setExportProgress(0);
    try {
      await exportAsPdf(barcodes, config, pageSetup, setExportProgress);
    } catch (e) {
      alert("Error: PDF Generation failed. Try reducing complexity.");
    } finally {
      setExportProgress(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFC] font-sans selection:bg-indigo-100 overflow-hidden h-screen">
      <header className="bg-slate-950 text-white px-4 md:px-8 py-4 md:py-5 shadow-2xl flex items-center justify-between z-[60] sticky top-0 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="lg:hidden p-2 hover:bg-slate-900 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="bg-indigo-600 p-2 rounded-xl md:rounded-2xl shadow-xl shadow-indigo-600/30">
            <Layout className="w-5 h-5 md:w-7 md:h-7" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter uppercase italic leading-none">Industrial <span className="text-indigo-400">Barcode</span></h1>
            <p className="text-[8px] md:text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-widest hidden sm:block">Precision Batch Controller v5.0</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 md:gap-10">
          <div className="hidden lg:flex gap-8 border-l border-slate-800 pl-8">
            <HeaderStat label="BATCH" value={stats.total} />
            <HeaderStat label="READY" value={stats.valid} color="text-emerald-400" />
            <HeaderStat label="ALERTS" value={stats.invalid} color="text-rose-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="lg:hidden text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md">{stats.valid}</span>
            <button onClick={() => dispatch({ type: 'CLEAR_ALL' })} className="bg-slate-900 hover:bg-rose-900/40 hover:text-rose-400 px-3 md:px-6 py-2 md:py-3 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all border border-slate-800 active:scale-95">
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Backdrop for Mobile */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-40 lg:hidden" 
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar Controls - Drawer on mobile, Fixed on Desktop */}
        <aside className={`
          fixed lg:static top-0 left-0 bottom-0 z-50
          w-full sm:w-[400px] md:w-[460px] 
          bg-white shadow-2xl transition-transform duration-300 transform
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          overflow-y-auto custom-scrollbar border-r
        `}>
          <div className="p-6 md:p-8 space-y-10 pb-40">
            <div className="flex lg:hidden justify-between items-center mb-6">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Configuration</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Input Ingestion */}
            <section className="space-y-6">
              <SectionHeader icon={<Plus size={16}/>} title="Data Streams" />
              <div className="flex bg-slate-100 p-1 rounded-xl md:rounded-2xl">
                {['manual', 'file', 'batch', 'range'].map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-2 md:py-2.5 text-[9px] md:text-[10px] font-black rounded-lg md:rounded-xl transition-all uppercase tracking-widest ${activeTab === tab ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>{tab}</button>
                ))}
              </div>
              <div className="bg-slate-50/50 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100">
                {activeTab === 'manual' && <ManualInput onAdd={(v) => addBarcodes([v])} />}
                {activeTab === 'batch' && <BatchInput onAdd={(list) => addBarcodes(list)} />}
                {activeTab === 'file' && <FileInput onAdd={(list) => addBarcodes(list)} setIsProcessing={setIsProcessing} setMsg={setProcessingMsg} />}
                {activeTab === 'range' && <RangeInput onAdd={(list) => addBarcodes(list)} />}
              </div>
            </section>

            {/* Symbology Specs */}
            <section className="space-y-6 pt-10 border-t border-slate-100">
              <SectionHeader icon={<Settings size={16}/>} title="Symbology Matrix" />
              <div className="grid gap-6">
                <SelectGroup label="Symbology Standard" value={config.format} onChange={v => setConfig({...config, format: v as BarcodeFormat})}>
                  {FORMAT_GROUPS.map(g => <optgroup key={g.name} label={g.name}>{g.formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>)}
                </SelectGroup>
                <div className="grid grid-cols-2 gap-4">
                  <UnitInput label="Width" value={config.width} unit={config.unit} onChange={v => setConfig({...config, width: v})} onUnitChange={u => setConfig({...config, unit: u})} />
                  <UnitInput label="Height" value={config.height} unit={config.unit} onChange={v => setConfig({...config, height: v})} onUnitChange={u => setConfig({...config, unit: u})} />
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <Type size={18} className="text-indigo-600" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">Label Text</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Toggle overlay</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={config.displayText} onChange={(e) => setConfig({...config, displayText: e.target.checked})} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            </section>

            {/* Layout Engine */}
            <section className="space-y-8 pt-10 border-t border-slate-100">
              <SectionHeader icon={<Printer size={16}/>} title="Layout Architecture" />
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <SelectGroup label="Stock Format" value={pageSetup.pageSize} onChange={v => {
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
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Margins</p>
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <UnitInput label="Top" value={pageSetup.marginTop} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, marginTop: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Bottom" value={pageSetup.marginBottom} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, marginBottom: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Left" value={pageSetup.marginLeft} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, marginLeft: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Right" value={pageSetup.marginRight} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, marginRight: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <UnitInput label="Item Gutter" value={pageSetup.gutter} unit={pageSetup.unit} onChange={v => setPageSetup({...pageSetup, gutter: v})} onUnitChange={u => setPageSetup({...pageSetup, unit: u})} />
                  <SelectGroup label="Grid Logic" value={pageSetup.template?.name || ''} onChange={v => setPageSetup({...pageSetup, template: LABEL_TEMPLATES.find(t => t.name === v)})}>
                    <option value="">Auto-Optimized</option>
                    {LABEL_TEMPLATES.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </SelectGroup>
                </div>

                {/* Efficiency HUD */}
                <div className="bg-slate-950 text-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl relative overflow-hidden group border border-white/5">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
                  <div className="relative z-10 space-y-6">
                    <div className="flex justify-between items-center text-[10px] font-black border-b border-white/10 pb-4 mb-2 uppercase tracking-[0.2em]">
                      <span className="flex items-center gap-2 text-indigo-400"><Sparkles size={12}/> Analysis Hub</span>
                      <span className="bg-indigo-600/20 text-indigo-400 px-3 py-1 rounded-full">{grid.efficiency.toFixed(1)}% Utility</span>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 md:mb-2">Matrix</p>
                        <p className="text-2xl md:text-3xl font-black">{grid.cols} <span className="text-slate-800">×</span> {grid.rows}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 md:mb-2">Per Sheet</p>
                        <p className="text-2xl md:text-3xl font-black text-indigo-500">{grid.totalCapacity}</p>
                      </div>
                    </div>
                    {grid.suggestions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <p className="text-[9px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 text-slate-500"><TrendingUp size={12}/> Optimization</p>
                        {grid.suggestions.map((s, i) => (
                          <p key={i} className="text-[10px] md:text-[11px] font-medium leading-relaxed opacity-80 italic text-slate-300 flex gap-2">
                            <Info size={12} className="text-indigo-500 shrink-0" /> {s}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6">
                  <SectionHeader icon={<GridIcon size={14}/>} title="Layout Proof" />
                  <LiveProof grid={grid} pageSetup={pageSetup} config={config} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8">
                  <button onClick={async () => { setExportProgress(0); await exportAsZip(barcodes, config, setExportProgress); setExportProgress(null); }} className="flex items-center justify-center gap-3 bg-white text-slate-900 py-4 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-slate-100 hover:border-indigo-100 transition-all shadow-xl active:scale-95">
                    <Layers size={18} /> PNG ZIP
                  </button>
                  <button onClick={handleExportPdf} className="flex items-center justify-center gap-3 bg-indigo-600 text-white py-4 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-2xl transition-all active:scale-95">
                    <FileText size={18} /> Export PDF
                  </button>
                </div>
              </div>
            </section>
          </div>
        </aside>

        {/* Dynamic Workspace */}
        <div className="flex-1 flex flex-col bg-[#F4F6FB] overflow-hidden">
          {/* Workspace Header */}
          <div className="bg-white border-b px-4 md:px-8 py-4 md:py-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm z-10 shrink-0">
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:flex-1">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input 
                  type="text" 
                  placeholder="Filter product batch..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="w-full pl-11 pr-4 py-3 md:py-4 border border-slate-100 rounded-xl md:rounded-2xl text-xs md:text-sm outline-none focus:ring-4 focus:ring-indigo-50 shadow-inner bg-slate-50/50 transition-all font-bold" 
                />
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                {['all', 'valid', 'invalid'].map((f) => (
                  <button key={f} onClick={() => setFilterType(f as any)} className={`flex-1 sm:flex-none px-4 md:px-6 py-2 md:py-2.5 text-[9px] md:text-[10px] font-black rounded-lg md:rounded-xl transition-all uppercase tracking-widest ${filterType === f ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>{f}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-4 md:gap-8 w-full sm:w-auto">
              <div className="flex items-center gap-2 md:gap-4 bg-white border border-slate-100 rounded-xl md:rounded-2xl p-1 shadow-sm">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="p-2 md:p-3 disabled:opacity-20 hover:bg-slate-50 rounded-lg transition-all"><ChevronLeft size={18} /></button>
                <span className="text-[9px] md:text-[10px] font-black text-slate-400 min-w-[80px] md:min-w-[120px] text-center uppercase tracking-widest">Page {currentPage}/{Math.max(1, stats.totalPages)}</span>
                <button disabled={currentPage === stats.totalPages || stats.totalPages === 0} onClick={() => setCurrentPage(p => Math.min(stats.totalPages, p + 1))} className="p-2 md:p-3 disabled:opacity-20 hover:bg-slate-50 rounded-lg transition-all"><ChevronRight size={18} /></button>
              </div>
              {selectedIds.size > 0 && (
                <button onClick={() => { dispatch({ type: 'DELETE_IDS', payload: Array.from(selectedIds) }); setSelectedIds(new Set()); }} className="bg-rose-50 text-rose-600 hover:bg-rose-100 px-4 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all border border-rose-100 flex items-center gap-2">
                  <Trash2 size={16} /> <span className="hidden sm:inline">Delete</span> ({selectedIds.size})
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 custom-scrollbar">
            {filteredBarcodes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <div className="bg-white p-8 md:p-14 rounded-[3rem] md:rounded-[4rem] shadow-2xl mb-6 md:mb-10 border border-slate-50 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                  <RotateCcw className="w-16 h-16 md:w-28 md:h-28 text-slate-100 group-hover:text-indigo-200 transition-all duration-700 relative z-10 animate-[spin_40s_linear_infinite]" strokeWidth={1} />
                </div>
                <h3 className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase italic">System Idle</h3>
                <p className="text-slate-400 text-sm md:text-base mt-3 max-w-sm text-center font-medium leading-relaxed uppercase tracking-widest px-4">No production data detected. Add data to start.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 md:gap-10 pb-40">
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

      {isProcessing && <Overlay title="Processing" msg={processingMsg} loading />}
      {exportProgress !== null && <Overlay title="Rendering Batch" msg={`Optimizing... ${exportProgress}%`} progress={exportProgress} />}
    </div>
  );
};

// UI Components

const HeaderStat: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color = "text-white" }) => (
  <div className="text-center group">
    <p className="text-[9px] font-black text-slate-500 group-hover:text-indigo-400 uppercase tracking-[0.3em] mb-1 transition-colors">{label}</p>
    <p className={`text-base font-black ${color}`}>{value}</p>
  </div>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <h2 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 md:gap-3">
    <span className="bg-slate-100 p-1 md:p-1.5 rounded-lg text-slate-500">{icon}</span> {title}
  </h2>
);

const SelectGroup: React.FC<{ label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }> = ({ label, value, onChange, children }) => (
  <div className="space-y-2">
    <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">{label}</label>
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 md:px-5 py-3 md:py-3.5 border border-slate-200 rounded-xl md:rounded-2xl text-xs outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all bg-white shadow-sm cursor-pointer font-bold appearance-none">
        {children}
      </select>
      <div className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 pointer-events-none opacity-30"><ChevronRight size={14} className="rotate-90"/></div>
    </div>
  </div>
);

const UnitInput: React.FC<{ label: string; value: number; unit: Unit; onChange: (v: number) => void; onUnitChange: (u: Unit) => void }> = ({ label, value, unit, onChange, onUnitChange }) => (
  <div className="space-y-2">
    <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">{label}</label>
    <div className="flex shadow-sm rounded-xl md:rounded-2xl overflow-hidden border border-slate-200 focus-within:ring-4 focus-within:ring-indigo-100/50 transition-all">
      <input type="number" step="any" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} className="flex-1 w-full px-3 md:px-4 py-2 md:py-3 text-xs outline-none font-bold bg-white" />
      <select value={unit} onChange={e => onUnitChange(e.target.value as Unit)} className="bg-slate-50 border-l border-slate-200 px-2 md:px-3 py-2 md:py-3 text-[9px] md:text-[10px] font-black uppercase tracking-tighter cursor-pointer outline-none">
        {Object.values(Unit).map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
      </select>
    </div>
  </div>
);

const LiveProof: React.FC<{ grid: GridResult, pageSetup: PageSetup, config: BarcodeConfig }> = ({ grid, pageSetup, config }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 340, height: 320 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ 
          width: clientWidth - 64, // subtract padding
          height: Math.max(300, clientHeight - 64) 
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const maxW = dimensions.width;
  const maxH = dimensions.height;
  const scale = Math.min(maxW / grid.pWidth, maxH / grid.pHeight);
  const vW = grid.pWidth * scale;
  const vH = grid.pHeight * scale;

  const bScale = UNIT_FACTORS[pageSetup.unit] / UNIT_FACTORS[config.unit];
  const bW_p = config.width * bScale;
  const bH_p = config.height * bScale;
  const gut_p = pageSetup.gutter;

  const actualGridW = grid.cols * bW_p + (grid.cols - 1) * gut_p;
  const actualGridH = grid.rows * bH_p + (grid.rows - 1) * gut_p;
  const xStart = pageSetup.marginLeft + (grid.pWidth - pageSetup.marginLeft - pageSetup.marginRight - actualGridW) / 2;
  const yStart = pageSetup.marginTop + (grid.pHeight - pageSetup.marginTop - pageSetup.marginBottom - actualGridH) / 2;

  const rects = [];
  if (grid.cols > 0 && grid.rows > 0) {
    const maxPreview = 30; // performance limit for preview
    for(let r=0; r < Math.min(grid.rows, maxPreview); r++) {
      for(let c=0; c < Math.min(grid.cols, maxPreview); c++) {
        rects.push(
          <rect key={`${r}-${c}`} x={(xStart + c * (bW_p + gut_p)) * scale} y={(yStart + r * (bH_p + gut_p)) * scale} width={bW_p * scale} height={bH_p * scale} className="fill-indigo-500/10 stroke-indigo-500/20 stroke-[0.5]" />
        );
      }
    }
  }

  return (
    <div ref={containerRef} className="flex items-center justify-center bg-slate-50/50 rounded-[1.5rem] md:rounded-[3rem] p-6 md:p-12 border border-slate-200/50 shadow-inner min-h-[300px] md:min-h-[320px]">
      <svg width={vW} height={vH} className="bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.1)] border border-slate-100 transition-all duration-500 overflow-visible rounded-sm">
        <rect x={pageSetup.marginLeft * scale} y={pageSetup.marginTop * scale} width={(grid.pWidth - pageSetup.marginLeft - pageSetup.marginRight) * scale} height={(grid.pHeight - pageSetup.marginTop - pageSetup.marginBottom) * scale} className="fill-none stroke-slate-200 stroke-dashed stroke-[0.5]" />
        {rects}
      </svg>
    </div>
  );
};

const BarcodeCard: React.FC<{ item: BarcodeItem, config: BarcodeConfig, isSelected: boolean, onToggle: () => void, onDelete: () => void }> = ({ item, config, isSelected, onToggle, onDelete }) => {
  const [url, setUrl] = useState('');
  useEffect(() => { 
    if (item.valid) {
      const timeout = setTimeout(() => {
        renderBarcodeToDataUrl(item, config).then(setUrl);
      }, 50);
      return () => clearTimeout(timeout);
    } 
  }, [item.data, config.format, config.displayText, config.width, config.height]);

  return (
    <div className={`group relative bg-white rounded-[1.5rem] md:rounded-[2.5rem] border-[3px] md:border-[3.5px] transition-all p-5 md:p-8 cursor-pointer hover:shadow-2xl hover:-translate-y-2 md:hover:-translate-y-4 ${isSelected ? 'border-indigo-600 shadow-indigo-100' : 'border-transparent shadow-xl shadow-slate-200/30'}`} onClick={onToggle}>
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <span className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">LN_{item.index}</span>
        <div className="flex items-center gap-2 md:gap-3">
          {item.valid ? <CheckCircle2 size={18} className="text-emerald-500 md:w-[22px] md:h-[22px]" /> : <XCircle size={18} className="text-rose-500 md:w-[22px] md:h-[22px]" />}
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="text-slate-200 hover:text-rose-500 transition-colors p-2 rounded-xl hover:bg-rose-50"><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="flex items-center justify-center min-h-[120px] md:min-h-[160px] bg-slate-50/50 rounded-[1.5rem] md:rounded-[2.5rem] p-4 md:p-8 overflow-hidden border border-slate-100 group-hover:bg-white transition-all relative">
        {item.valid ? (url ? <img src={url} alt={item.data} className="max-w-full h-auto object-contain transition-transform group-hover:scale-110 drop-shadow-md" /> : <div className="animate-pulse w-full h-20 md:h-24 bg-slate-100 rounded-xl md:rounded-2xl" />) : <div className="text-center p-4"><AlertTriangle className="mx-auto text-amber-500 mb-3 md:mb-4 w-8 h-8 md:w-11 md:h-11" /><p className="text-[9px] md:text-[10px] text-rose-500 font-black uppercase tracking-tighter leading-tight">{item.error || 'INVALID DATA'}</p></div>}
      </div>
      <div className="mt-6 md:mt-10 flex items-center justify-between gap-4 md:gap-8">
        <div className="truncate flex-1">
          <p className="text-sm md:text-base font-black text-slate-900 truncate tracking-tight mb-1">{item.data}</p>
          <p className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest">{config.format}</p>
        </div>
        <div className={`p-2.5 md:p-3.5 rounded-xl md:rounded-2xl shadow-lg transition-all ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-200 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>{isSelected ? <CheckCircle2 size={18} /> : <Copy size={18} />}</div>
      </div>
    </div>
  );
};

const ManualInput: React.FC<{ onAdd: (v: string) => void }> = ({ onAdd }) => {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-2 md:gap-4">
      <input type="text" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && (onAdd(v), setV(''))} placeholder="Entry Code..." className="flex-1 px-4 md:px-6 py-3 md:py-4 border border-slate-200 rounded-xl md:rounded-2xl text-xs md:text-sm outline-none focus:ring-4 focus:ring-indigo-100 bg-white font-bold" />
      <button onClick={() => {if(v) onAdd(v); setV('');}} className="bg-indigo-600 text-white px-5 md:px-8 rounded-xl md:rounded-2xl hover:bg-indigo-700 shadow-xl active:scale-90 transition-all"><Plus size={24}/></button>
    </div>
  );
};

const BatchInput: React.FC<{ onAdd: (list: string[]) => void }> = ({ onAdd }) => {
  const [v, setV] = useState('');
  return (
    <div className="space-y-4">
      <textarea value={v} onChange={e => setV(e.target.value)} placeholder="One SKU per line..." className="w-full h-32 md:h-44 px-4 md:px-6 py-3 md:py-5 border border-slate-200 rounded-xl md:rounded-[2rem] text-xs md:text-sm focus:ring-4 focus:ring-indigo-100 bg-white font-bold resize-none custom-scrollbar" />
      <button onClick={() => {onAdd(v.split('\n').filter(Boolean)); setV('');}} className="w-full bg-indigo-600 text-white py-3 md:py-4.5 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-2xl transition-all">Import Batch</button>
    </div>
  );
};

const FileInput: React.FC<{ onAdd: (list: string[]) => void; setIsProcessing: (v: boolean) => void; setMsg: (v: string) => void }> = ({ onAdd, setIsProcessing, setMsg }) => (
  <div className="border-3 border-dashed border-slate-200 rounded-xl md:rounded-[2.5rem] p-8 md:p-12 text-center hover:border-indigo-500 transition-all group relative bg-white hover:shadow-2xl">
    <input type="file" accept=".csv,.xlsx,.xls" onChange={async e => {
      const f = e.target.files?.[0]; if(!f) return;
      setIsProcessing(true); setMsg(`Parsing ${f.name}...`);
      if(f.name.endsWith('.csv')) {
        Papa.parse(f, { header: true, complete: (r) => { 
          onAdd(r.data.flatMap((row: any) => Array(parseInt(row.quantity || '1')).fill(row.code || row.barcode || Object.values(row)[0])));
          setIsProcessing(false); (e.target as HTMLInputElement).value = '';
        }});
      } else {
        const r = new FileReader(); r.onload = (ev) => {
          const wb = XLSX.read(ev.target?.result, {type:'binary'});
          const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
          onAdd(data.flatMap((row: any) => Array(parseInt(row.quantity || '1')).fill(row.code || row.barcode || Object.values(row)[0])));
          setIsProcessing(false); (e.target as HTMLInputElement).value = '';
        }; r.readAsBinaryString(f);
      }
    }} className="absolute inset-0 opacity-0 cursor-pointer" />
    <TableProperties className="mx-auto text-slate-200 group-hover:text-indigo-500 mb-4 md:mb-5 transition-all group-hover:scale-110 w-10 h-10 md:w-14 md:h-14" />
    <p className="text-sm md:text-base font-black text-slate-800">Drop Inventory File</p>
    <p className="text-[9px] md:text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">CSV / Excel support</p>
  </div>
);

const RangeInput: React.FC<{ onAdd: (list: string[]) => void }> = ({ onAdd }) => {
  const [p, setP] = useState({ pre: 'SKU-', start: 1, end: 50, suf: '' });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <SimpleInput label="Prefix" value={p.pre} onChange={v => setP({...p, pre: v})} />
        <SimpleInput label="Suffix" value={p.suf} onChange={v => setP({...p, suf: v})} />
        <SimpleInput label="Start" type="number" value={p.start} onChange={v => setP({...p, start: parseInt(v)})} />
        <SimpleInput label="End" type="number" value={p.end} onChange={v => setP({...p, end: parseInt(v)})} />
      </div>
      <button onClick={() => {
        const l = [];
        const limit = Math.min(p.end, p.start + 5000); 
        for(let i=p.start; i<=limit; i++) l.push(`${p.pre}${i}${p.suf}`);
        onAdd(l);
      }} className="w-full bg-indigo-600 text-white py-3 md:py-4.5 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl transition-all">Generate Sequence</button>
    </div>
  );
};

const SimpleInput = ({ label, type = 'text', value, onChange }: any) => (
  <div className="space-y-2">
    <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-2 md:py-3.5 border border-slate-200 rounded-xl text-xs md:text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all bg-white font-bold" />
  </div>
);

const Overlay: React.FC<{ title: string, msg: string, loading?: boolean, progress?: number }> = ({ title, msg, loading = false, progress = 0 }) => (
  <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center z-[200] p-4">
    <div className="bg-white p-8 md:p-16 rounded-[2rem] md:rounded-[4.5rem] shadow-2xl max-w-lg w-full space-y-8 md:space-y-12 text-center border border-white/20 animate-in fade-in zoom-in duration-300">
      {loading ? (
        <div className="flex justify-center"><div className="w-16 h-16 md:w-20 md:h-20 border-[6px] md:border-[10px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="relative h-4 md:h-5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
          <div className="absolute inset-y-0 left-0 bg-indigo-600 transition-all duration-300 rounded-full shadow-lg" style={{ width: `${progress}%` }}></div>
        </div>
      )}
      <div className="space-y-3 md:space-y-4">
        <p className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase italic">{title}</p>
        <p className="text-sm md:text-lg font-black text-indigo-500 uppercase tracking-widest">{msg}</p>
      </div>
    </div>
  </div>
);

export default App;
