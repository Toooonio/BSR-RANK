# Amazon BSR Brand Analyzer

一个用于统计 Amazon Best Sellers（BSR）榜单中品牌数量分布的本地网站工具。它会将排名 1-100 的商品按 `1-10`、`11-50`、`51-100` 三个互不重叠的区间统计，并提供图表、编辑、筛选和导出功能。

## 环境要求

- Node.js 20 或更新版本
- npm 9 或更新版本

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。前端运行在 5173 端口，Express API 运行在 3001 端口，Vite 已配置 API 代理。

生产构建：

```bash
npm run build
npm start
```

## 导入方式

1. 粘贴 Amazon Best Sellers URL 后点击“开始分析”。服务端会以普通浏览器请求头尝试获取页面。
2. 当 Amazon 阻止抓取时，选择“粘贴 HTML 分析”，粘贴榜单页面源代码。也支持每行 `排名 商品标题` 的简单文本列表。
3. 上传 CSV。表头应包含以下字段（大小写不敏感）：

```csv
rank,brand,title,asin,url
1,Brand A,Product Title A,B0XXXXXXX,https://www.amazon.com/dp/B0XXXXXXX
```

`brand` 缺失时会按标题第一个有效词推测品牌；也可以在商品明细表中直接编辑品牌。编辑立即更新统计表和图表。

“使用样例数据”会载入内置的八条测试数据，便于快速验证流程。

## 解析说明

服务端在 `server/bsrParser.ts` 中提供：

- `parseBSRHtml(html)`：识别 Amazon 常见榜单卡片、排名、标题、商品链接、ASIN、图片与可用品牌字段。
- `calculateBrandStats(products)`：按照 `1-10`、`11-50`、`51-100` 计算品牌统计，并按总数、Top 10 数、Top 50 数排序。

Amazon 的页面结构、地区站点和反自动化机制会变化。URL 抓取只是一个便利入口；HTML 与 CSV 导入是稳定的备用路径。

## 导出

- Excel：包含“品牌统计”、“商品明细”和“原始解析数据”三个工作表。
- CSV：包含品牌统计和商品明细两个区段。
- JSON：包含统计数据、商品明细与原始解析数据。
