
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
  Sparkles, TrendingUp, Info, Type, Menu, X, Download
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
  const itemsPerPage = 32;

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType]);

  const handleExportPdf = async () => {
    if (stats.valid === 0) return alert("System Status: No valid barcodes present in the current batch.");
    setExportProgress(0);
    try {
      await exportAsPdf(barcodes, config, pageSetup, setExportProgress);
    } catch (e) {
      console.error(e);
      alert("Critical Error: Render pipeline failure. Reducing label complexity may resolve this.");
    } finally {
      setExportProgress(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FC] selection:bg-indigo-600/10 transition-colors duration-500">
      {/* Dynamic Header */}
      <header className="shrink-0 z-[60] bg-slate-950 text-white px-4 md:px-8 py-3 md:py-4 flex items-center justify-between shadow-2xl border-b border-white/5">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="lg:hidden p-2.5 bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors"
            aria-label="Toggle Configuration"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-600/20">
            <Layout className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base md:text-lg font-black tracking-tight uppercase italic leading-none">Industrial <span className="text-indigo-400">Barcode</span></h1>
            <p className="text-[9px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest">Precision Controller v5</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 md:gap-8">
          <div className="hidden lg:flex gap-6 border-l border-slate-800 pl-6">
            <HeaderStat label="BATCH" value={stats.total} />
            <HeaderStat label="VERIFIED" value={stats.valid} color="text-emerald-400" />
            <HeaderStat label="ALERTS" value={stats.invalid} color="text-rose-400" />
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => dispatch({ type: 'CLEAR_ALL' })} 
              className="bg-slate-900 hover:bg-rose-950/50 hover:text-rose-400 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-800 active:scale-95"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Responsive Drawer Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300" 
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar Controls */}
        <aside className={`
          fixed lg:static top-0 left-0 bottom-0 z-50
          w-[85vw] sm:w-[400px] md:w-[460px] 
          bg-white shadow-2xl lg:shadow-none transition-transform duration-500 ease-out transform
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          overflow-y-auto custom-scrollbar border-r border-slate-100 flex flex-col
        `}>
          <div className="p-6 md:p-8 space-y-10 pb-40">
            <div className="flex lg:hidden items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Settings Hub</span>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-slate-50 rounded-lg"><X size={18}/></button>
            </div>

            {/* Input Dashboard */}
            <section className="space-y-6">
              <SectionHeader icon={<Plus size={16}/>} title="Data Ingestion" />
              <div className="flex bg-slate-100 p-1 rounded-xl md:rounded-2xl">
                {(['manual', 'file', 'batch', 'range'] as const).map((tab) => (
                  <button 
                    key={tab} 
                    onClick={() => setActiveTab(tab)} 
                    className={`flex-1 py-2 text-[9px] md:text-[10px] font-black rounded-lg md:rounded-xl transition-all uppercase tracking-widest ${activeTab === tab ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-500'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="bg-slate-50/50 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100">
                {activeTab === 'manual' && <ManualInput onAdd={(v: string) => addBarcodes([v])} />}
                {activeTab === 'batch' && <BatchInput onAdd={(list: string[]) => addBarcodes(list)} />}
                {activeTab === 'file' && <FileInput onAdd={(list: string[]) => addBarcodes(list)} setIsProcessing={setIsProcessing} setMsg={setProcessingMsg} />}
                {activeTab === 'range' && <RangeInput onAdd={(list: string[]) => addBarcodes(list)} />}
              </div>
            </section>

            {/* Parameters Matrix */}
            <section className="space-y-6 pt-10 border-t border-slate-100">
              <SectionHeader icon={<Settings size={16}/>} title="Symbology Matrix" />
              <div className="grid gap-6">
                <SelectGroup label="Active Standard" value={config.format} onChange={(v: string) => setConfig({...config, format: v as BarcodeFormat})}>
                  {FORMAT_GROUPS.map(g => <optgroup key={g.name} label={g.name}>{g.formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>)}
                </SelectGroup>
                <div className="grid grid-cols-2 gap-4">
                  <UnitInput label="Label Width" value={config.width} unit={config.unit} onChange={(v: number) => setConfig({...config, width: v})} onUnitChange={(u: Unit) => setConfig({...config, unit: u})} />
                  <UnitInput label="Label Height" value={config.height} unit={config.unit} onChange={(v: number) => setConfig({...config, height: v})} onUnitChange={(u: Unit) => setConfig({...config, unit: u})} />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-all hover:bg-white hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform"><Type size={18} /></div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">Readable Label</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Toggle text overlay</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={config.displayText} onChange={(e) => setConfig({...config, displayText: e.target.checked})} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            </section>

            {/* Page Architecture */}
            <section className="space-y-8 pt-10 border-t border-slate-100">
              <SectionHeader icon={<Printer size={16}/>} title="Print Architecture" />
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <SelectGroup label="Base Format" value={pageSetup.pageSize} onChange={(v: string) => {
                    const dims = PAGE_SIZES[v as PageSizeType];
                    setPageSetup({...pageSetup, pageSize: v as PageSizeType, width: dims.width, height: dims.height, unit: dims.unit});
                  }}>
                    {Object.keys(PAGE_SIZES).map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectGroup>
                  <SelectGroup label="Sheet Setup" value={pageSetup.orientation} onChange={(v: string) => setPageSetup({...pageSetup, orientation: v as any})}>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </SelectGroup>
                </div>

                <div className="space-y-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Margin Config</p>
                  <div className="grid grid-cols-2 gap-3">
                    <UnitInput label="Top" value={pageSetup.marginTop} unit={pageSetup.unit} onChange={(v: number) => setPageSetup({...pageSetup, marginTop: v})} onUnitChange={(u: Unit) => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Bottom" value={pageSetup.marginBottom} unit={pageSetup.unit} onChange={(v: number) => setPageSetup({...pageSetup, marginBottom: v})} onUnitChange={(u: Unit) => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Left" value={pageSetup.marginLeft} unit={pageSetup.unit} onChange={(v: number) => setPageSetup({...pageSetup, marginLeft: v})} onUnitChange={(u: Unit) => setPageSetup({...pageSetup, unit: u})} />
                    <UnitInput label="Right" value={pageSetup.marginRight} unit={pageSetup.unit} onChange={(v: number) => setPageSetup({...pageSetup, marginRight: v})} onUnitChange={(u: Unit) => setPageSetup({...pageSetup, unit: u})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <UnitInput label="Item Gap" value={pageSetup.gutter} unit={pageSetup.unit} onChange={(v: number) => setPageSetup({...pageSetup, gutter: v})} onUnitChange={(u: Unit) => setPageSetup({...pageSetup, unit: u})} />
                  <SelectGroup label="Grid Profile" value={pageSetup.template?.name || ''} onChange={(v: string) => setPageSetup({...pageSetup, template: LABEL_TEMPLATES.find(t => t.name === v)})}>
                    <option value="">Optimized Mesh</option>
                    {LABEL_TEMPLATES.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </SelectGroup>
                </div>

                {/* Efficiency HUD */}
                <div className="bg-slate-950 text-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl relative overflow-hidden group border border-white/5 transition-all hover:border-indigo-500/30">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
                  <div className="relative z-10 space-y-6">
                    <div className="flex justify-between items-center text-[10px] font-black border-b border-white/10 pb-4 mb-2 uppercase tracking-[0.2em]">
                      <span className="flex items-center gap-2 text-indigo-400"><Sparkles size={12}/> Analysis Hub</span>
                      <span className="bg-indigo-600/20 text-indigo-400 px-3 py-1 rounded-full">{grid.efficiency.toFixed(1)}% Usage</span>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Matrix</p>
                        <p className="text-2xl md:text-3xl font-black">{grid.cols} <span className="text-slate-800">×</span> {grid.rows}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Capacity</p>
                        <p className="text-2xl md:text-3xl font-black text-indigo-500">{grid.totalCapacity}</p>
                      </div>
                    </div>
                    {grid.suggestions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><TrendingUp size={12}/> Strategies</p>
                        {grid.suggestions.map((s, i) => (
                          <p key={i} className="text-[10px] md:text-[11px] font-medium leading-relaxed text-slate-400 italic flex gap-2">
                            <Info size={12} className="text-indigo-600 shrink-0" /> {s}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6">
                  <SectionHeader icon={<GridIcon size={14}/>} title="Live Placement" />
                  <LiveProof grid={grid} pageSetup={pageSetup} config={config} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8">
                  <button onClick={async () => { setExportProgress(0); await exportAsZip(barcodes, config, setExportProgress); setExportProgress(null); }} className="flex items-center justify-center gap-3 bg-white text-slate-900 py-4 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-slate-100 hover:border-indigo-100 transition-all shadow-xl active:scale-95">
                    <Download size={18} className="text-indigo-600" /> PNG Archive
                  </button>
                  <button onClick={handleExportPdf} className="flex items-center justify-center gap-3 bg-indigo-600 text-white py-4 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-2xl transition-all active:scale-95">
                    <FileText size={18} /> Export PDF
                  </button>
                </div>
              </div>
            </section>
          </div>
        </aside>

        {/* Dynamic Canvas Area */}
        <div className="flex-1 flex flex-col bg-[#F4F6FB] overflow-hidden">
          {/* Action Bar */}
          <div className="bg-white border-b px-4 md:px-8 py-3 md:py-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm z-10 shrink-0">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:flex-1">
              <div className="relative w-full sm:max-w-xs md:max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="text" 
                  placeholder="Scan or filter batch..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="w-full pl-10 pr-4 py-2.5 md:py-3 border border-slate-100 rounded-xl md:rounded-2xl text-xs md:text-sm outline-none focus:ring-4 focus:ring-indigo-50 shadow-inner bg-slate-50/50 transition-all font-bold" 
                />
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
                {(['all', 'valid', 'invalid'] as const).map((f) => (
                  <button key={f} onClick={() => setFilterType(f)} className={`flex-1 sm:flex-none px-4 md:px-6 py-2 md:py-2 text-[9px] md:text-[10px] font-black rounded-lg md:rounded-xl transition-all uppercase tracking-widest ${filterType === f ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400 hover:text-slate-500'}`}>{f}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 md:gap-6 w-full sm:w-auto">
              <div className="flex items-center gap-2 md:gap-4 bg-white border border-slate-100 rounded-xl p-1 shadow-sm">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="p-2 md:p-2.5 disabled:opacity-10 hover:bg-slate-50 rounded-lg transition-all"><ChevronLeft size={16} /></button>
                <span className="text-[9px] md:text-[10px] font-black text-slate-400 min-w-[60px] md:min-w-[100px] text-center uppercase tracking-widest tabular-nums">P_{currentPage}/{Math.max(1, stats.totalPages)}</span>
                <button disabled={currentPage === stats.totalPages || stats.totalPages === 0} onClick={() => setCurrentPage(p => Math.min(stats.totalPages, p + 1))} className="p-2 md:p-2.5 disabled:opacity-10 hover:bg-slate-50 rounded-lg transition-all"><ChevronRight size={16} /></button>
              </div>
              {selectedIds.size > 0 && (
                <button onClick={() => { dispatch({ type: 'DELETE_IDS', payload: Array.from(selectedIds) }); setSelectedIds(new Set()); }} className="bg-rose-50 text-rose-600 hover:bg-rose-100 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border border-rose-100 flex items-center gap-2 animate-in slide-in-from-right duration-300">
                  <Trash2 size={14} /> <span className="hidden md:inline">Prune</span> ({selectedIds.size})
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 custom-scrollbar relative">
            {filteredBarcodes.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 md:gap-10 pb-40">
                {paginatedBarcodes.map((b) => (
                  <BarcodeCard 
                    key={b.id} 
                    item={b} 
                    config={config} 
                    isSelected={selectedIds.has(b.id)} 
                    onToggle={() => {
                      const n = new Set(selectedIds);
                      if (n.has(b.id)) n.delete(b.id); else n.add(b.id);
                      setSelectedIds(n);
                    }} 
                    onDelete={() => { 
                      dispatch({ type: 'DELETE_IDS', payload: [b.id] }); 
                      const n = new Set(selectedIds); 
                      n.delete(b.id); 
                      setSelectedIds(n); 
                    }} 
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isProcessing && <Overlay title="Engine Core" msg={processingMsg} loading />}
      {exportProgress !== null && <Overlay title="Rendering Pipeline" msg={`Frame Generation... ${exportProgress}%`} progress={exportProgress} />}
    </div>
  );
};

// UI Components

const HeaderStat: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color = "text-white" }) => (
  <div className="text-center group">
    <p className="text-[9px] font-black text-slate-500 group-hover:text-indigo-400 uppercase tracking-[0.3em] mb-0.5 transition-colors">{label}</p>
    <p className={`text-sm font-black mono ${color}`}>{value}</p>
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
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 md:px-5 py-2.5 md:py-3.5 border border-slate-200 rounded-xl md:rounded-2xl text-[11px] md:text-xs outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all bg-white shadow-sm cursor-pointer font-bold appearance-none">
        {children}
      </select>
      <div className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 pointer-events-none opacity-20"><ChevronRight size={14} className="rotate-90"/></div>
    </div>
  </div>
);

const UnitInput: React.FC<{ label: string; value: number; unit: Unit; onChange: (v: number) => void; onUnitChange: (u: Unit) => void }> = ({ label, value, unit, onChange, onUnitChange }) => (
  <div className="space-y-1.5">
    <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">{label}</label>
    <div className="flex shadow-sm rounded-xl md:rounded-2xl overflow-hidden border border-slate-200 focus-within:ring-4 focus-within:ring-indigo-100/50 transition-all">
      <input type="number" step="any" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} className="flex-1 w-full px-3 md:px-4 py-2 md:py-3 text-[11px] md:text-xs outline-none font-bold bg-white" />
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
          width: clientWidth - 48,
          height: Math.max(260, clientHeight - 48) 
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const scale = Math.min(dimensions.width / grid.pWidth, dimensions.height / grid.pHeight);
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
    const maxPreview = 40; 
    for(let r=0; r < Math.min(grid.rows, maxPreview); r++) {
      for(let c=0; c < Math.min(grid.cols, maxPreview); c++) {
        rects.push(
          <rect key={`${r}-${c}`} x={(xStart + c * (bW_p + gut_p)) * scale} y={(yStart + r * (bH_p + gut_p)) * scale} width={bW_p * scale} height={bH_p * scale} className="fill-indigo-500/5 stroke-indigo-500/10 stroke-[0.3]" />
        );
      }
    }
  }

  return (
    <div ref={containerRef} className="flex items-center justify-center bg-slate-50 rounded-[1.5rem] md:rounded-[3rem] p-6 md:p-8 border border-slate-100 shadow-inner min-h-[280px]">
      <svg width={vW} height={vH} className="bg-white shadow-[0_15px_40px_-10px_rgba(0,0,0,0.08)] border border-slate-100 transition-all duration-700 overflow-visible">
        <rect x={pageSetup.marginLeft * scale} y={pageSetup.marginTop * scale} width={(grid.pWidth - pageSetup.marginLeft - pageSetup.marginRight) * scale} height={(grid.pHeight - pageSetup.marginTop - pageSetup.marginBottom) * scale} className="fill-none stroke-slate-200 stroke-dashed stroke-[0.5]" />
        {rects}
      </svg>
    </div>
  );
};

const BarcodeCard: React.FC<{ item: BarcodeItem, config: BarcodeConfig, isSelected: boolean, onToggle: () => void, onDelete: () => void }> = ({ item, config, isSelected, onToggle, onDelete }) => {
  const [url, setUrl] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => { 
    if (item.valid) {
      setIsLoaded(false);
      const timeout = setTimeout(() => {
        renderBarcodeToDataUrl(item, config).then(data => {
          setUrl(data);
          setIsLoaded(true);
        });
      }, 50);
      return () => clearTimeout(timeout);
    } 
  }, [item.data, config.format, config.displayText, config.width, config.height]);

  return (
    <div 
      className={`group relative bg-white rounded-[1.5rem] md:rounded-[2.5rem] border-[3px] transition-all p-5 md:p-7 cursor-pointer hover:shadow-2xl hover:-translate-y-2 ${isSelected ? 'border-indigo-600 shadow-indigo-600/10' : 'border-transparent shadow-lg shadow-slate-200/20 hover:border-indigo-100'}`} 
      onClick={onToggle}
    >
      <div className="flex items-center justify-between mb-5 md:mb-7">
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em] mono">ID_{item.index}</span>
        <div className="flex items-center gap-2">
          {item.valid ? <CheckCircle2 size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-rose-500" />}
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="text-slate-200 hover:text-rose-500 transition-colors p-2 rounded-xl hover:bg-rose-50"><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="flex items-center justify-center min-h-[140px] md:min-h-[160px] bg-slate-50/30 rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-6 overflow-hidden border border-slate-50 group-hover:bg-white transition-all">
        {!item.valid ? (
          <div className="text-center p-4">
            <AlertTriangle className="mx-auto text-amber-500 mb-3 w-8 h-8 md:w-10 md:h-10" />
            <p className="text-[9px] text-rose-500 font-black uppercase tracking-tighter leading-tight">{item.error || 'CRC_ERR'}</p>
          </div>
        ) : isLoaded ? (
          <img src={url} alt={item.data} className="max-w-full h-auto object-contain transition-transform group-hover:scale-105 drop-shadow-sm" />
        ) : (
          <div className="animate-pulse w-full h-16 md:h-20 bg-slate-100/50 rounded-xl" />
        )}
      </div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="truncate flex-1">
          <p className="text-sm md:text-base font-black text-slate-900 truncate tracking-tight mb-0.5 mono">{item.data}</p>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{config.format}</p>
        </div>
        <div className={`p-2.5 rounded-xl shadow-lg transition-all ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-200 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>
          <Copy size={16} />
        </div>
      </div>
    </div>
  );
};

const ManualInput: React.FC<{ onAdd: (v: string) => void }> = ({ onAdd }) => {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-2">
      <input 
        type="text" 
        value={v} 
        onChange={e => setV(e.target.value)} 
        onKeyDown={e => e.key === 'Enter' && (onAdd(v), setV(''))} 
        placeholder="Entry SKU..." 
        className="flex-1 px-4 py-3 md:py-3.5 border border-slate-200 rounded-xl md:rounded-2xl text-[11px] md:text-xs outline-none focus:ring-4 focus:ring-indigo-100 bg-white font-bold mono" 
      />
      <button onClick={() => {if(v) onAdd(v); setV('');}} className="bg-indigo-600 text-white px-5 rounded-xl md:rounded-2xl hover:bg-indigo-700 shadow-xl active:scale-90 transition-all"><Plus size={22}/></button>
    </div>
  );
};

const BatchInput: React.FC<{ onAdd: (list: string[]) => void }> = ({ onAdd }) => {
  const [v, setV] = useState('');
  return (
    <div className="space-y-4">
      <textarea 
        value={v} 
        onChange={e => setV(e.target.value)} 
        placeholder="One code per line..." 
        className="w-full h-32 md:h-44 px-4 py-4 border border-slate-200 rounded-xl md:rounded-[2rem] text-[11px] md:text-xs focus:ring-4 focus:ring-indigo-100 bg-white font-bold resize-none custom-scrollbar mono" 
      />
      <button onClick={() => {onAdd(v.split('\n').filter(Boolean)); setV('');}} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-2xl transition-all">Import List</button>
    </div>
  );
};

const FileInput: React.FC<{ onAdd: (list: string[]) => void; setIsProcessing: (v: boolean) => void; setMsg: (v: string) => void }> = ({ onAdd, setIsProcessing, setMsg }) => (
  <div className="border-3 border-dashed border-slate-200 rounded-xl md:rounded-[2.5rem] p-8 md:p-12 text-center hover:border-indigo-500 transition-all group relative bg-white hover:shadow-2xl">
    <input type="file" accept=".csv,.xlsx,.xls" onChange={async e => {
      const f = e.target.files?.[0]; if(!f) return;
      setIsProcessing(true); setMsg(`Parsing ${f.name}...`);
      try {
        if(f.name.endsWith('.csv')) {
          Papa.parse(f, { header: true, skipEmptyLines: true, complete: (r) => { 
            onAdd((r.data as any[]).flatMap((row: any) => {
              const code = row.code || row.barcode || Object.values(row)[0];
              const qty = parseInt(row.quantity || row.qty || '1') || 1;
              return Array(Math.min(qty, 500)).fill(String(code));
            }));
            setIsProcessing(false); (e.target as HTMLInputElement).value = '';
          }});
        } else {
          const r = new FileReader(); r.onload = (ev) => {
            const dataRaw = ev.target?.result as string;
            const wb = XLSX.read(dataRaw, {type:'binary'});
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            onAdd(data.flatMap((row: any) => {
              const code = row.code || row.barcode || Object.values(row)[0];
              const qty = parseInt(row.quantity || row.qty || '1') || 1;
              return Array(Math.min(qty, 500)).fill(String(code));
            }));
            setIsProcessing(false); (e.target as HTMLInputElement).value = '';
          }; r.readAsBinaryString(f);
        }
      } catch (err) {
        alert("File parsing error. Ensure the format is standard CSV or Excel.");
        setIsProcessing(false);
      }
    }} className="absolute inset-0 opacity-0 cursor-pointer" />
    <TableProperties className="mx-auto text-slate-200 group-hover:text-indigo-500 mb-4 transition-all group-hover:scale-110 w-10 h-10 md:w-14 md:h-14" />
    <p className="text-sm font-black text-slate-800">Drop Manifest</p>
    <p className="text-[9px] md:text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">CSV / Excel support</p>
  </div>
);

const RangeInput: React.FC<{ onAdd: (list: string[]) => void }> = ({ onAdd }) => {
  const [p, setP] = useState({ pre: 'SKU-', start: 1, end: 50, suf: '' });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <SimpleInput label="Prefix" value={p.pre} onChange={(v: string) => setP({...p, pre: v})} />
        <SimpleInput label="Suffix" value={p.suf} onChange={(v: string) => setP({...p, suf: v})} />
        <SimpleInput label="Start" type="number" value={p.start} onChange={(v: string) => setP({...p, start: parseInt(v) || 0})} />
        <SimpleInput label="End" type="number" value={p.end} onChange={(v: string) => setP({...p, end: parseInt(v) || 0})} />
      </div>
      <button onClick={() => {
        const l = [];
        const limit = Math.min(p.end, p.start + 2000); 
        for(let i=p.start; i<=limit; i++) l.push(`${p.pre}${i}${p.suf}`);
        onAdd(l);
      }} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl transition-all">Generate Sequence</button>
    </div>
  );
};

interface SimpleInputProps {
  label: string;
  type?: string;
  value: string | number;
  onChange: (v: string) => void;
}

const SimpleInput: React.FC<SimpleInputProps> = ({ label, type = 'text', value, onChange }) => (
  <div className="space-y-1.5">
    <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-[11px] md:text-xs outline-none focus:ring-4 focus:ring-indigo-100 transition-all bg-white font-bold mono" 
    />
  </div>
);

const EmptyState: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center text-slate-300">
    <div className="bg-white p-8 md:p-14 rounded-[3rem] md:rounded-[4rem] shadow-2xl mb-8 border border-slate-50 relative overflow-hidden group">
      <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
      <RotateCcw className="w-16 h-16 md:w-28 md:h-28 text-slate-100 group-hover:text-indigo-200 transition-all duration-700 relative z-10 animate-[spin_60s_linear_infinite]" strokeWidth={1} />
    </div>
    <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase italic">Controller Idle</h3>
    <p className="text-slate-400 text-[10px] md:text-sm mt-3 max-w-xs text-center font-bold leading-relaxed uppercase tracking-[0.2em] px-4">Initialize production data stream to begin.</p>
  </div>
);

const Overlay: React.FC<{ title: string, msg: string, loading?: boolean, progress?: number }> = ({ title, msg, loading = false, progress = 0 }) => (
  <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[200] p-4">
    <div className="bg-white p-10 md:p-16 rounded-[2.5rem] md:rounded-[4rem] shadow-2xl max-w-lg w-full space-y-10 text-center border border-white/10 animate-in fade-in zoom-in duration-500">
      {loading ? (
        <div className="flex justify-center">
          <div className="w-16 h-16 border-[8px] border-indigo-600 border-t-transparent rounded-full animate-spin shadow-lg shadow-indigo-600/20"></div>
        </div>
      ) : (
        <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner">
          <div className="absolute inset-y-0 left-0 bg-indigo-600 transition-all duration-300 rounded-full shadow-lg" style={{ width: `${progress}%` }}></div>
        </div>
      )}
      <div className="space-y-4">
        <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase italic">{title}</p>
        <p className="text-[11px] md:text-sm font-black text-indigo-500 uppercase tracking-[0.3em]">{msg}</p>
      </div>
    </div>
  </div>
);

export default App;
