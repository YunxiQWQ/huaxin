# 第三方组件与素材

画芯原创源码采用 MIT License，见根目录 `LICENSE`。以下第三方组件、字体与照片继续适用其各自许可证和署名要求。

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
许可证全文见 `public/fonts/OFL-*.txt`。霞鹜文楷使用[官方 v1.530 Regular 原版](https://github.com/lxgw/LxgwWenKai/releases/tag/v1.530)，SHA-256 为 `2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b`，不修改该字体文件；其余字体经过子集化与静态字重处理。各字体保留版权与许可证文本，保留名称及额外许可条件以所附文本为准。

本机字体由用户在浏览器中授权读取，不随站点分发，不打包进工程或上传；使用及 PDF 嵌入应遵守各字体自身的许可。程序会检查 OS/2 嵌入标记，并对禁止子集化的字体采用整字面嵌入。

## 模板照片（public/templates/img）

来自 Unsplash（Unsplash License），作者署名见 `public/templates/CREDITS.txt`。模板中的稿件、人名和机构均为虚构示例。
