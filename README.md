# AI 日报 · 每日晨报

把每天散落在各处的 AI 资讯，整理成一份能一口气读完的中文晨报。

- **在线地址**：https://season19840122.github.io/ai-daily-site/
- **数据源**：[AIHOT 日报](https://aihot.virxact.com)
- **技术形态**：纯静态站点，无构建、无后端、无依赖

## 它长什么样

首屏给出本期总条数和五个版块的分布，下面按版块分栏铺卡片，顶部锚点导航跟随滚动高亮。左右两侧的箭头可以翻到上一期 / 下一期，也可以直接下拉选日期。

五个版块固定为：

| 版块 | 内容 |
| --- | --- |
| 模型发布/更新 | 新模型、新权重、版本迭代 |
| 产品发布/更新 | 面向用户的产品与功能 |
| 行业动态 | 公司、资本、政策层面动向 |
| 论文研究 | 值得留意的研究成果 |
| 技巧与观点 | 实践方法与从业者观点 |

每张卡片都保留 AIHOT 原文和第三方出处两个链接，方便回查。

## 目录结构

```
.
├── index.html            # 站点入口，全部内容由 JS 渲染
├── longimg.html          # 长图排版页，只给 shot.py 截图用，不对外
├── assets/
│   ├── app.js            # 数据加载、渲染、锚点跟随、期数切换
│   └── style.css
├── data/
│   ├── index.json        # 期数清单：最新一期 + 每期条数/导语/长图索引
│   └── 2026-08.json      # 按月归档的正文数据
├── img/                  # 每日长图产物
│   ├── 2026-08-30-grid-1.png   # 3:4 分页图（小红书 / 头条）
│   ├── 2026-08-30-long.png     # 超长图（公众号 / 知乎）
│   ├── 2026-08-30.html         # 图片预览页
│   └── qr-2026-08-30.svg       # 指向当期日报的二维码
└── _work/                # 生成链路（非站点运行所需）
    ├── config.json       # 出图配置：站点地址、站点名、是否带二维码
    ├── shot.py           # 长图出图脚本
    ├── briefs.json       # 卡片摘要
    ├── times.json        # 时间归类
    └── raw/              # 每日原始抓取数据
```

## 本地预览

站点用 `fetch` 读 JSON，`file://` 直接双击打开会被浏览器拦截，必须起一个 http 服务：

```bash
cd ai-daily-site
python3 -m http.server 8777
# 打开 http://127.0.0.1:8777
```

## 数据是怎么组织的

- `data/index.json` 是入口，只放清单：哪几天有日报、每天多少条、导语是什么、长图在哪。
- `data/YYYY-MM.json` 按月存正文，`{ days: { "2026-08-30": { date, generatedAtText, windowText, sections: [...] } } }`。
- 期数切换走 URL hash，`#2026-08-30` 这样的链接可以直接分享到具体某一天。

新增一期，只要往当月的 JSON 里加一天，再把摘要补进 `index.json` 的 `days` 数组（按日期倒序）即可，不用动页面代码。

## 出长图

`shot.py` 会渲染 `longimg.html` 并截图，产出 3:4 分页图和超长图，同时把结果写回 `data/index.json` 的 `shots` 字段：

```bash
# 必须用装了 qrcode 的那个 venv 跑，系统默认 python3 没有
/Users/Season/.workbuddy/binaries/python/envs/default/bin/python3 _work/shot.py 2026-08-30

# 只出其中一种
python3 _work/shot.py 2026-08-30 --only grid
python3 _work/shot.py 2026-08-30 --only long
```

依赖两样外部东西：Python 包 `qrcode`（生成二维码 SVG），以及 `/usr/local/bin/agent-browser`（截图）。

站点地址变了不用改代码，改 `_work/config.json` 里的 `site_url` 再重跑一遍就行，`{date}` 会被替换成当期日期：

```json
{
  "site_url": "https://aihot.virxact.com/daily/{date}",
  "site_name": "AI 日报",
  "qr_enabled": true
}
```

目前二维码仍指向 AIHOT 上的原版日报。要换成自己的站点，把 `site_url` 改成 `https://season19840122.github.io/ai-daily-site/#{date}`，然后对需要更新日期重跑一次上面的命令——二维码是烧进图里的，改配置不会自动生效。

## 部署

静态文件直接托管即可，无需构建。当前部署在 GitHub Pages，`main` 分支根目录：

```bash
git add . && git commit -m "更新日报" && git push
```

推送后 Pages 会在一到两分钟内自动重新构建。

## 关于内容

日报内容由 AIHOT 公开发布，第三方原文的版权归原作者所有。卡片摘要是在原文基础上压缩的中文概述，引用其中数字或原话前请先回原文核对。卡片内时间除标注「本期日报收录」外，均为第三方原文的发布时间（北京时间）。
