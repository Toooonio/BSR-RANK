import { ChangeEvent, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  BarChart3, ChevronDown, ClipboardCopy, Download, ExternalLink, FileCode2,
  FileSpreadsheet, FileUp, LoaderCircle, Play, RotateCcw, Search, Sparkles, Upload, X,
} from 'lucide-react';
import {
  Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { sampleProducts } from './data';
import { calculateBrandStats, exportData, parseCsvRows } from './lib';
import type { BrandStats, ProductItem } from './types';

type ApiResponse = {
  products?: ProductItem[];
  message?: string;
  coverage?: { retrieved: number; expected: number; missingRanks: number[] };
};
type ProductSort = 'rank' | 'brand' | 'title';

const COLORS = ['#0f8a8d', '#f4a261', '#d65a5a', '#5271c4', '#6ba368', '#a66bbe', '#ba7c43', '#438c9c', '#dc7998', '#6e8092'];

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) {
  return <div className="metric"><div className={`metric-mark ${tone}`} /><div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div></div>;
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="chart-panel"><div className="panel-heading"><h2>{title}</h2><span>Top 100</span></div>{children}</section>;
}

function EmptyState() {
  return <div className="empty"><BarChart3 size={30} strokeWidth={1.5} /><h2>等待导入榜单数据</h2><p>输入 BSR 链接，粘贴页面 HTML，上传 CSV，或直接加载样例开始分析。</p></div>;
}

export default function App() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [url, setUrl] = useState('');
  const [html, setHtml] = useState('');
  const [showHtml, setShowHtml] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProductSort>('rank');
  const [ascending, setAscending] = useState(true);
  const csvInput = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => calculateBrandStats(products), [products]);
  const brands = useMemo(() => stats.map((row) => row.brand), [stats]);
  const visibleProducts = useMemo(() => products.filter((item) => (brandFilter === 'all' || item.brand === brandFilter) && item.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const compare = sort === 'rank' ? a.rank - b.rank : a[sort].localeCompare(b[sort]);
      return ascending ? compare : -compare;
    }), [products, brandFilter, search, sort, ascending]);
  const chartStats = stats.slice(0, 10);
  const pieStats = useMemo(() => {
    if (stats.length <= 10) return stats;
    const head = stats.slice(0, 10);
    const rest = stats.slice(10).reduce((sum, item) => sum + item.total, 0);
    return [...head, { brand: 'Others', total: rest, top1To10: 0, top11To50: 0, top51To100: 0, percentage: Number((rest / products.length * 100).toFixed(1)) }];
  }, [stats, products.length]);

  const acceptProducts = (next: ProductItem[], source: string) => {
    const sorted = next.filter((item) => item.rank >= 1 && item.rank <= 100).sort((a, b) => a.rank - b.rank).slice(0, 100);
    if (!sorted.length) { setError('未识别到有效商品。请检查排名、标题和 CSV 列名。'); return; }
    setProducts(sorted);
    setBrandFilter('all');
    setError('');
    setNotice(`已通过${source}载入 ${sorted.length} 个商品`);
  };

  const postAnalysis = async (endpoint: string, body: Record<string, string>, source: string) => {
    setLoading(true); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const raw = await response.text();
      let result: ApiResponse;
      try {
        result = JSON.parse(raw) as ApiResponse;
      } catch {
        throw new Error('分析接口不可用或返回了网页错误页。请确认本地 API 已启动；部署到 Vercel 时需包含 /api 函数。');
      }
      if (!response.ok || !result.products) throw new Error(result.message || '分析失败，请稍后重试。');
      acceptProducts(result.products, source);
      if (result.coverage?.missingRanks.length) {
        setNotice(`已导入 ${result.coverage.retrieved}/${result.coverage.expected} 个真实排名商品；缺少排名 ${result.coverage.missingRanks.join(', ')}。可粘贴页面 HTML 或上传 CSV 补齐。`);
      }
      if (endpoint.includes('parse-html')) { setShowHtml(false); setHtml(''); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '分析失败，请稍后重试。');
    } finally { setLoading(false); }
  };

  const handleCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(''); setNotice('');
    Papa.parse<Record<string, unknown>>(file, { header: true, skipEmptyLines: true, complete: ({ data, errors }) => {
      if (errors.length) { setError('CSV 文件格式无法读取，请使用 UTF-8 CSV 文件。'); return; }
      acceptProducts(parseCsvRows(data), 'CSV 文件');
    }});
    event.target.value = '';
  };

  const updateBrand = (rank: number, brand: string) => setProducts((items) => items.map((item) => item.rank === rank ? { ...item, brand: brand.trim() || 'Unknown' } : item));
  const toggleSort = (column: ProductSort) => { if (sort === column) setAscending((value) => !value); else { setSort(column); setAscending(column === 'rank'); } };
  const copyStats = async () => {
    const text = [['品牌', '1-10', '11-50', '51-100', '总数量', '占比'], ...stats.map((row) => [row.brand, row.top1To10, row.top11To50, row.top51To100, row.total, `${row.percentage}%`])].map((row) => row.join('\t')).join('\n');
    await navigator.clipboard.writeText(text); setNotice('品牌统计表已复制到剪贴板');
  };

  return <main>
    <header className="topbar"><div className="brand"><div className="brand-icon"><BarChart3 size={19} /></div><div><h1>Amazon BSR Brand Analyzer</h1><p>快速统计亚马逊 BSR 榜单中各品牌在不同排名区间的数量分布</p></div></div><div className="header-tag"><span />ANALYTICS WORKSPACE</div></header>

    <div className="content">
      <section className="input-area" aria-label="榜单数据输入">
        <div className="input-copy"><span className="eyebrow">DATA SOURCE</span><h2>导入 BSR 榜单</h2><p>优先尝试抓取链接；无法访问时可使用页面 HTML 或 CSV。</p></div>
        <div className="url-row"><input aria-label="BSR 榜单 URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="粘贴 Amazon Best Sellers 榜单 URL，例如 https://www.amazon.com/Best-Sellers/zgbs/..." />
          <button className="button primary" disabled={loading || !url.trim()} onClick={() => postAnalysis('/api/analyze-url', { url }, '链接')}>
            {loading ? <LoaderCircle className="spin" size={17} /> : <Play size={17} fill="currentColor" />}开始分析
          </button>
        </div>
        <div className="input-actions"><button className="text-button" onClick={() => setShowHtml((open) => !open)}><FileCode2 size={16} />粘贴 HTML 分析</button><span className="rule" /><button className="text-button" onClick={() => csvInput.current?.click()}><FileUp size={16} />上传 CSV 文件</button><input ref={csvInput} className="hidden" type="file" accept=".csv,text/csv" onChange={handleCsv} /><span className="rule" /><button className="text-button sample" onClick={() => acceptProducts(sampleProducts, '内置样例')}><Sparkles size={16} />使用样例数据</button></div>
        {showHtml && <div className="html-box"><textarea value={html} onChange={(event) => setHtml(event.target.value)} placeholder="粘贴 Amazon BSR 榜单页面 HTML，或每行输入“排名 商品标题”的商品列表" /><div><button className="button ghost" onClick={() => { setShowHtml(false); setHtml(''); }}>取消</button><button className="button primary" disabled={loading || !html.trim()} onClick={() => postAnalysis('/api/parse-html', { html }, '粘贴 HTML')}>{loading && <LoaderCircle className="spin" size={16} />}解析 HTML</button></div></div>}
        {error && <p className="status error"><X size={16} />{error}</p>}{notice && <p className="status success">{notice}</p>}
      </section>

      {products.length === 0 ? <EmptyState /> : <>
        <section className="overview"><Metric label="已解析商品数" value={products.length} detail="前 100 名范围内" tone="teal" /><Metric label="品牌数量" value={stats.length} detail="含 Unknown 品牌" tone="blue" /><Metric label="Top 10 品牌数" value={new Set(products.filter((item) => item.rank <= 10).map((item) => item.brand)).size} detail="排名 1 至 10" tone="orange" /><Metric label="Unknown 商品数" value={products.filter((item) => item.brand === 'Unknown').length} detail="可在明细表修改" tone="red" /></section>

        <section className="section-head"><div><span className="eyebrow">DISTRIBUTION</span><h2>品牌分布概览</h2></div><p>图表展示前 10 个品牌，饼图其余品牌归为 Others</p></section>
        <section className="charts"><ChartPanel title="品牌总数量"><ResponsiveContainer width="100%" height={280}><BarChart data={chartStats} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}><XAxis dataKey="brand" tick={{ fontSize: 12, fill: '#61717c' }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#61717c' }} /><Tooltip cursor={{ fill: '#eef3f3' }} /><Bar dataKey="total" name="商品数量" fill="#0f8a8d" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></ChartPanel>
          <ChartPanel title="排名区间分布"><ResponsiveContainer width="100%" height={280}><BarChart data={chartStats} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}><XAxis dataKey="brand" tick={{ fontSize: 12, fill: '#61717c' }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#61717c' }} /><Tooltip cursor={{ fill: '#eef3f3' }} /><Legend iconType="circle" iconSize={8} /><Bar dataKey="top1To10" name="1-10" stackId="ranks" fill="#d65a5a" /><Bar dataKey="top11To50" name="11-50" stackId="ranks" fill="#f4a261" /><Bar dataKey="top51To100" name="51-100" stackId="ranks" fill="#5271c4" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></ChartPanel>
          <ChartPanel title="品牌占比"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={pieStats} dataKey="total" nameKey="brand" cx="50%" cy="48%" innerRadius={55} outerRadius={93} paddingAngle={2}>{pieStats.map((item, index) => <Cell key={item.brand} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value: number, _name, info) => [`${value} 个 (${(info.payload as BrandStats).percentage}%)`, '商品数量']} /><Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" iconSize={8} /></PieChart></ResponsiveContainer></ChartPanel></section>

        <section className="data-section"><div className="table-title"><div><span className="eyebrow">BRAND SUMMARY</span><h2>品牌统计表</h2></div><div className="table-actions"><button className="icon-button" title="复制统计结果" onClick={copyStats}><ClipboardCopy size={17} /></button><button className="button compact" onClick={() => exportData('xlsx', products, stats)}><FileSpreadsheet size={16} />导出 Excel</button><button className="button compact" onClick={() => exportData('csv', products, stats)}><Download size={16} />导出 CSV</button><button className="button compact" onClick={() => exportData('json', products, stats)}><Download size={16} />导出 JSON</button></div></div>
          <div className="table-wrap"><table><thead><tr><th>品牌</th><th>1-10 数量</th><th>11-50 数量</th><th>51-100 数量</th><th>总数量</th><th>占比</th></tr></thead><tbody>{stats.map((row) => <tr key={row.brand}><td className="brand-name">{row.brand}</td><td>{row.top1To10}</td><td>{row.top11To50}</td><td>{row.top51To100}</td><td className="strong">{row.total}</td><td><span className="percent">{row.percentage}%</span></td></tr>)}</tbody></table></div>
        </section>

        <section className="data-section detail-section"><div className="table-title"><div><span className="eyebrow">PRODUCTS</span><h2>商品明细</h2><p>{visibleProducts.length} / {products.length} 个商品</p></div><button className="button danger" onClick={() => { setProducts([]); setError(''); setNotice('数据已清空'); }}><RotateCcw size={16} />清空数据</button></div>
          <div className="filters"><div className="search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索商品标题" /></div><label className="select-wrap"><span>品牌</span><select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}><option value="all">全部品牌</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select><ChevronDown size={14} /></label></div>
          <div className="table-wrap"><table className="details"><thead><tr><th><button onClick={() => toggleSort('rank')}>排名 {sort === 'rank' && (ascending ? '↑' : '↓')}</button></th><th><button onClick={() => toggleSort('brand')}>品牌 {sort === 'brand' && (ascending ? '↑' : '↓')}</button></th><th><button onClick={() => toggleSort('title')}>商品标题 {sort === 'title' && (ascending ? '↑' : '↓')}</button></th><th>ASIN</th><th>商品链接</th></tr></thead><tbody>{visibleProducts.map((item) => <tr key={item.rank}><td><span className="rank">#{item.rank}</span></td><td><input className="brand-input" value={item.brand} aria-label={`编辑第 ${item.rank} 名商品品牌`} onChange={(event) => updateBrand(item.rank, event.target.value)} /></td><td className="product-title">{item.title}</td><td className="asin">{item.asin || '—'}</td><td>{item.url ? <a className="product-link" href={item.url} target="_blank" rel="noreferrer">查看商品<ExternalLink size={14} /></a> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div>
        </section>
      </>}
    </div>
  </main>;
}
