# 第三方组件与素材

## 运行时依赖（随站点打包）

| 组件 | 用途 | 许可 |
|---|---|---|
| React / React DOM | 界面 | MIT |
| pdf-lib | 浏览器端生成 PDF | MIT |
| @pdf-lib/fontkit | 字体解析（供 pdf-lib） | MIT |
| harfbuzzjs（HarfBuzz WebAssembly） | PDF 导出时的字体子集化 | MIT（HarfBuzz：Old MIT） |
| fflate | 工程包与图片 ZIP 打包 | MIT |
| idb | IndexedDB 封装 | ISC |
| lucide-react | 界面图标 | ISC |
| Tailwind CSS | 样式 | MIT |

## 构建与测试工具（不随站点发布）

subset-font（BSD-3-Clause）、playwright-core（Apache-2.0）、pdfjs-dist（Apache-2.0，用于验收 PDF 文字与尺寸）、Vite（MIT）、TypeScript（Apache-2.0）、oxfmt（MIT）。

## 字体（public/fonts，SIL Open Font License 1.1）

思源宋体 / 思源黑体（Noto Serif SC / Noto Sans SC，© Adobe & Google）、霞鹜文楷（LXGW WenKai，© lxgw）、站酷小薇（ZCOOL XiaoWei，© ZCOOL）、马善政楷书（Ma Shan Zheng，© Ma ShanZheng）。
许可证全文见 `public/fonts/OFL-*.txt`。站点提供的是经子集化与静态字重处理的 Web 字体，保留了版权与许可证文本；保留名称及额外许可条件以各字体所附文本为准。

## 模板照片（public/templates/img）

来自 Unsplash（Unsplash License），作者署名见 `public/templates/CREDITS.txt`。模板中的稿件、人名和机构均为虚构示例。
