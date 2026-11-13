import type { Doc, DocKind } from "../model/types";
import { A } from "./articles";
import { E, I, L, R, T, docFrom, group, page } from "./build";

export interface TemplateDef {
  id: string;
  name: string;
  category: Exclude<DocKind, "blank">;
  description: string;
  width: number;
  height: number;
  sizeName: string;
  build: () => Doc;
}

export const CATEGORY_NAMES: Record<string, string> = {
  newspaper: "报纸",
  magazine: "校刊",
  album: "画册",
  manual: "手册",
};

const RED = "#b3261e";
const INK = "#1f1f1f";
const PAPER = "#f4efe4";

// ---------- 四版校园报（四开 270 × 390） ----------
function campusPaper(): Doc {
  const W = 270;
  const M = 15;
  const CW = 240;
  const col = (CW - 15) / 4; // 56.25
  const cx = (i: number) => M + i * (col + 5);
  const span = (n: number) => n * col + (n - 1) * 5;

  const folioHeader = (label: string, no: string) => [
    T(M, 10, 120, 6, "2025年3月18日　星期二　　青禾校园报", "date"),
    T(W - M - 120, 8.5, 120, 9, label, "subhead", {
      style: {
        align: "right",
        color: RED,
        fontSize: 15,
        fontFamily: "serif",
        fontWeight: 900,
        letterSpacing: 0.1,
      },
    }),
    T(M, 16.5, 60, 6, no, "folio", { style: { color: RED } }),
    L(M, 24, CW, RED, 0.9, "double"),
  ];

  const p1 = page([
    L(M, 13, CW, RED, 0.5),
    ...group(
      R(M, 19, 40, 30, null, { color: RED, width: 0.35, dash: "solid" }),
      T(M, 19, 40, 30, "统一刊号\nCN00-0000\n第 24 期", "issue", {
        verticalAlign: "middle",
        style: { color: RED, lineHeight: 1.6 },
      }),
    ),
    T(60, 15.5, 150, 36, "青禾校园报", "masthead", {
      verticalAlign: "middle",
      style: { fontSize: 78 },
    }),
    ...group(
      R(W - M - 40, 19, 40, 30, null, { color: RED, width: 0.35, dash: "solid" }),
      T(W - M - 40, 19, 40, 30, "2025年3月18日\n星期二\n本期 4 版", "date", {
        verticalAlign: "middle",
        style: { color: RED, align: "center", lineHeight: 1.6 },
      }),
    ),
    R(M, 53, CW, 7, RED),
    T(
      M,
      53,
      CW,
      7,
      "主办：青禾市第一中学　　承办：校学生记者团　　校园热线：0000-1234567　　第一版 · 要闻",
      "issue",
      { verticalAlign: "middle", style: { color: "#ffffff", fontSize: 8.5 } },
    ),
    T(M, 64, CW, 7, A.leadKicker, "kicker"),
    T(M, 71, CW, 16, A.leadTitle, "headline", { style: { fontSize: 32 } }),
    T(M, 90, CW, 20, A.leadIntro, "lead"),
    I(M, 113, span(2), 80, "library", { fy: 0.35 }),
    T(
      M,
      194.5,
      span(2),
      9,
      "▲ 新图书馆阅览区南侧的落地窗正对香樟林，成为同学们最喜欢的读书角。　本报记者 摄",
      "caption",
    ),
    T(cx(2), 113, span(2), 157, A.leadBody, "body", { columns: 2, columnGap: 5 }),
    R(M, 207, span(2), 7, RED),
    T(M + 3, 207, 40, 7, "校园快讯", "column", {
      verticalAlign: "middle",
      style: { fontSize: 10.5 },
    }),
    T(M, 217, span(2), 50, A.briefs, "body", {
      columns: 1,
      style: { fontFamily: "sans", fontSize: 8.5, indent: 0, spaceAfter: 3, lineHeight: 1.55 },
    }),
    R(M, 272, CW, 104, null, { color: RED, width: 0.4, dash: "solid" }),
    T(M + 5, 276, CW - 10, 11, A.secondTitle, "headline", { style: { fontSize: 20 } }),
    T(M + 5, 290, 170, 82, A.secondBody, "body", { columns: 3, columnGap: 4 }),
    I(M + 180, 290, 55, 50, "lab"),
    T(
      M + 180,
      342,
      55,
      30,
      "▲ 决赛现场，“追光者”小组向评委演示太阳能自动浇花装置的工作原理。",
      "caption",
    ),
    L(M, 381, CW, "#999999", 0.2),
    T(M, 382.5, CW, 5, "第一版　要闻　　责任编辑：张　岚　　版式：学生记者团", "byline", {
      style: { fontSize: 7 },
    }),
  ]);

  const p2 = page([
    ...folioHeader("校园 · 生活", "第二版"),
    I(M, 30, CW, 118, "campus-lawn", { fy: 0.45 }),
    T(M, 149.5, CW, 7, "▲ 清晨的校园。学校劳动教育基地就在主教学楼东侧。　本报记者 摄", "caption"),
    T(M, 162, CW, 14, "在“开心农场”里，读懂一粒种子", "headline", {
      style: { align: "left", fontSize: 26 },
    }),
    T(M, 178, CW, 6, "本报记者　李欣怡　陈思远", "byline"),
    T(M, 188, span(3), 142, A.feature, "body", { columns: 3, columnGap: 5 }),
    R(M, 336, span(3), 40, PAPER),
    T(M + 5, 340, 60, 8, "小农人社团招新", "subhead", { style: { color: RED } }),
    T(
      M + 5,
      350,
      span(3) - 10,
      23,
      "想亲手种出一棵番茄吗？“小农人社团”面向初一、初二年级招募首批社员，每周三下午在劳动教育基地开展活动，内容包括育苗、堆肥、病虫害观察和农事摄影。报名请于3月25日前联系劳动课程组王老师。",
      "body",
      { style: { fontFamily: "sans", fontSize: 8.5, lineHeight: 1.6 } },
    ),
    R(cx(3), 188, col, 108, PAPER),
    T(cx(3) + 4, 192, col - 8, 9, "记者手记", "subhead", { style: { color: RED } }),
    L(cx(3) + 4, 202, col - 8, RED, 0.3),
    T(
      cx(3) + 4,
      205,
      col - 8,
      88,
      "采访那天，我也拿起锄头试了试。不到十分钟，手心就磨得发烫。\n\n同学们告诉我，第一年的番茄几乎颗粒无收，他们查资料、问老师，才知道是浇水太勤。第二年，番茄架上挂满了果实。\n\n比起收获本身，更珍贵的是这份从失败中学习的耐心。也许这正是劳动教育想教给我们的：所有美好的事物，都需要时间慢慢生长。",
      "lead",
      { style: { fontSize: 9.5, lineHeight: 1.7 } },
    ),
    I(cx(3), 302, col, 56, "campus"),
    T(cx(3), 360, col, 16, "▲ 菜园就在主教学楼东侧。", "caption"),
    L(M, 381, CW, "#999999", 0.2),
    T(M, 382.5, CW, 5, "第二版　校园 · 生活　　责任编辑：李　默", "byline", {
      style: { fontSize: 7 },
    }),
  ]);

  const p3 = page([
    ...folioHeader("文体 · 赛场", "第三版"),
    T(M, 30, CW, 15, A.basketTitle, "headline", { style: { fontSize: 28 } }),
    I(M, 49, span(3), 104, "basketball", { fy: 0.4 }),
    T(
      M,
      154.5,
      span(3),
      8,
      "▲ 校园篮球联赛半决赛，高二（2）班替补后卫周子豪在最后时刻命中绝杀三分。　本报记者 摄",
      "caption",
    ),
    T(M, 165, span(3), 97, A.basketBody, "body", { columns: 3, columnGap: 5 }),
    R(cx(3), 49, col, 213, PAPER),
    T(cx(3) + 4, 53, col - 8, 9, "赛况速递", "subhead", { style: { color: RED } }),
    L(cx(3) + 4, 63, col - 8, RED, 0.3),
    T(cx(3) + 4, 66, col - 8, 62, A.scores, "body", {
      style: {
        fontFamily: "sans",
        fontSize: 8,
        indent: 0,
        align: "left",
        lineHeight: 1.6,
        spaceAfter: 4,
      },
    }),
    I(cx(3) + 4, 130, col - 8, 56, "freethrow"),
    T(cx(3) + 4, 188, col - 8, 12, "▲ 罚球线前，屏息凝神。", "caption"),
    T(
      cx(3) + 4,
      204,
      col - 8,
      54,
      "决赛预告\n时间：3月21日（周五）15:30\n地点：学校体育馆\n对阵：高二（2）班 vs 高三（3）班\n校电视台全程直播",
      "body",
      {
        style: { fontFamily: "sans", fontSize: 8.5, indent: 0, align: "left", lineHeight: 1.7 },
      },
    ),
    L(M, 268, CW, INK, 0.6),
    T(M, 272, CW, 11, "春季运动会报名开启　十二个项目等你来挑战", "headline", {
      style: { fontSize: 18, align: "left" },
    }),
    T(M, 287, span(3), 76, A.sportsMeet, "body", { columns: 3, columnGap: 5 }),
    I(cx(3), 287, col, 56, "campus-lawn"),
    T(cx(3), 345, col, 20, "▲ 运动会将在新翻修的田径场举行。", "caption"),
    L(M, 381, CW, "#999999", 0.2),
    T(M, 382.5, CW, 5, "第三版　文体 · 赛场　　责任编辑：王　磊", "byline", {
      style: { fontSize: 7 },
    }),
  ]);

  const p4 = page([
    ...folioHeader("副刊 · 青禾", "第四版"),
    T(M, 32, CW, 15, A.essayTitle, "headline", {
      style: { fontFamily: "xiaowei", fontWeight: 400, fontSize: 30 },
    }),
    T(M, 49, CW, 6, "高三（1）班　苏　晴", "byline", { style: { align: "center" } }),
    T(M, 60, CW, 70, A.essay, "body", {
      columns: 3,
      columnGap: 7,
      style: { fontFamily: "kai", fontSize: 10.5, lineHeight: 1.75 },
    }),
    R(M, 144, 117.5, 140, "#fbf8f2", { color: RED, width: 1.2, dash: "double" }),
    T(M + 8, 152, 101.5, 124, A.poem, "body", {
      verticalAlign: "middle",
      style: { fontFamily: "kai", fontSize: 11, indent: 0, align: "center", lineHeight: 1.85 },
    }),
    T(M + 8, 262, 101.5, 8, "—— 初三（2）班　林　夏", "byline", { style: { align: "right" } }),
    I(137.5, 144, 117.5, 126, "mist-trees", { fy: 0.55 }),
    T(137.5, 272, 117.5, 12, "▲ 雨后的香樟林。　摄影：初二（3）班 何　川", "caption"),
    L(M, 296, CW, INK, 0.4),
    T(M, 300, 60, 8, "书香 · 读后", "subhead", { style: { color: RED } }),
    T(
      M + 62,
      300.5,
      178,
      8,
      "在平凡中看见不平凡　——读《平凡的世界》　高二（4）班　赵一鸣",
      "byline",
      { style: { align: "right" } },
    ),
    T(M, 311, CW, 22, A.review, "body", { columns: 2, columnGap: 7, style: { fontSize: 9.5 } }),
    R(M, 340, CW, 36, PAPER),
    T(M + 6, 344, 30, 8, "征稿启事", "subhead", { style: { color: RED } }),
    T(
      M + 6,
      353,
      CW - 12,
      21,
      "《青禾》副刊长期面向全校师生征集散文、诗歌、随笔、书评及摄影作品。来稿请注明班级、姓名，发送至学生记者团信箱或交至行政楼三楼团委办公室。优秀作品将择期刊登，并推荐参加市中学生文学作品评选。",
      "body",
      { style: { fontFamily: "sans", fontSize: 8.5, lineHeight: 1.6 } },
    ),
    L(M, 381, CW, "#999999", 0.2),
    T(
      M,
      382.5,
      CW,
      5,
      "第四版　副刊 · 青禾　　责任编辑：苏　晴　　本报地址：青禾市第一中学行政楼三楼",
      "byline",
      { style: { fontSize: 7 } },
    ),
  ]);

  return docFrom({
    name: "青禾校园报 · 第24期",
    kind: "newspaper",
    width: 270,
    height: 390,
    sizeLabel: "四开报纸",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    pages: [p1, p2, p3, p4],
  });
}

// ---------- 电子画册（大 16 开 210 × 285） ----------
function teaAlbum(): Doc {
  const W = 210;
  const H = 285;
  const GREEN = "#2f3a33";
  const cover = page([
    I(0, 0, W, H, "mist-trees"),
    R(0, 0, W, H, "#000000", null, { opacity: 0.2 }),
    T(20, 30, W - 40, 30, "山居茶事", "masthead", {
      style: { fontFamily: "xiaowei", color: "#ffffff", fontSize: 60, letterSpacing: 0.3 },
    }),
    T(20, 64, W - 40, 10, "一座茶舍里的四季", "kicker", {
      style: { color: "#f2efe8", fontSize: 14, letterSpacing: 0.4, fontFamily: "serif" },
    }),
    L(85, 82, 40, "#ffffff", 0.4),
    T(20, 86, W - 40, 8, "MOUNTAIN · TEA · SLOW LIFE", "issue", {
      style: { color: "#f2efe8", fontSize: 8, letterSpacing: 0.3 },
    }),
    T(20, H - 22, W - 40, 8, "青禾摄影社 出品　·　二〇二五 · 春", "issue", {
      style: { color: "#ffffff", fontSize: 9, letterSpacing: 0.2 },
    }),
  ]);
  const toc = page(
    [
      T(24, 30, 80, 16, "目录", "headline", {
        style: { align: "left", fontSize: 30, color: GREEN },
      }),
      T(24, 48, 80, 7, "CONTENTS", "issue", {
        style: { align: "left", letterSpacing: 0.4, color: "#7c8a7f" },
      }),
      L(24, 62, 162, GREEN, 0.4),
      T(
        24,
        72,
        120,
        120,
        "01　入山\n云雾深处的茶舍\n\n02　茶舍\n三间木屋，一方小院\n\n03　制茶\n杀青、揉捻与等待\n\n04　茶席\n一杯茶的时间",
        "body",
        {
          style: {
            fontFamily: "serif",
            fontSize: 12,
            indent: 0,
            align: "left",
            lineHeight: 1.7,
            color: GREEN,
          },
        },
      ),
      T(146, 72, 40, 120, "03\n\n\n05\n\n\n06\n\n\n07", "body", {
        style: {
          fontFamily: "serif",
          fontSize: 12,
          indent: 0,
          align: "right",
          lineHeight: 1.7,
          color: GREEN,
        },
      }),
      I(24, 200, 162, 62, "teapot", { fy: 0.55 }),
      T(24, 265, 162, 8, "题图：院中的旧茶壶", "caption", { style: { align: "right" } }),
    ],
    "#f6f2ea",
  );
  const p3 = page([
    I(0, 0, W, 140, "mountains"),
    T(24, 152, 60, 14, "入山", "headline", {
      style: { align: "left", fontSize: 26, color: GREEN },
    }),
    T(70, 156, 116, 8, "01 / 云雾深处的茶舍", "issue", {
      style: { align: "right", color: "#7c8a7f" },
    }),
    L(24, 169, 162, GREEN, 0.3),
    T(24, 174, 162, 15, A.teaIntro, "lead", { style: { color: GREEN, fontSize: 11 } }),
    T(24, 193, 162, 72, A.teaBody, "body", {
      columns: 2,
      columnGap: 7,
      style: { fontSize: 10, lineHeight: 1.8 },
    }),
    T(24, 272, 162, 6, "— 03 —", "issue", { style: { color: "#7c8a7f" } }),
  ]);
  const p4 = page(
    [
      I(24, 26, 78, 118, "tea-cups"),
      I(108, 26, 78, 118, "teapot"),
      T(24, 147, 78, 10, "茶盏：手工柴烧，每一只都有不同的窑变。", "caption"),
      T(108, 147, 78, 10, "老茶壶：用了二十年，壶身已养出温润的光泽。", "caption"),
      T(24, 168, 162, 14, "三间木屋，一方小院", "headline", {
        style: { align: "left", fontSize: 20, color: GREEN },
      }),
      T(
        24,
        186,
        162,
        76,
        "茶舍的陈设极简：一张老榆木茶桌，几只粗陶茶盏，墙上挂着主人自己写的字。窗外就是茶园，推开窗，满眼都是层层叠叠的绿。\n老陈说，器物不必名贵，用得顺手、看着舒心就好。那把老茶壶跟了他二十年，壶嘴有一个小小的豁口，他却舍不得换。“它见过的客人，比我记得的还多。”",
        "body",
        { columns: 2, columnGap: 7 },
      ),
      T(24, 272, 162, 6, "— 05 —", "issue", { style: { color: "#7c8a7f" } }),
    ],
    "#fbf9f4",
  );
  const p5 = page([
    I(0, 0, W, H, "steps"),
    R(0, 190, W, 60, "#000000", null, { opacity: 0.35 }),
    T(24, 200, 162, 24, A.teaQuote, "lead", {
      verticalAlign: "middle",
      style: { color: "#ffffff", fontSize: 16, indent: 0, align: "center", fontFamily: "kai" },
    }),
    T(24, 228, 162, 8, "— 茶舍主人 老陈", "issue", {
      style: { color: "#e9e4d8", align: "center" },
    }),
  ]);
  const back = page(
    [
      E(90, 96, 30, 30, null, { color: "#d9d2bf", width: 0.4, dash: "solid" }),
      T(90, 96, 30, 30, "茶", "masthead", {
        verticalAlign: "middle",
        style: { fontSize: 36, color: "#d9d2bf", letterSpacing: 0 },
      }),
      T(30, 136, 150, 12, "山居茶事", "headline", {
        style: {
          fontFamily: "xiaowei",
          fontWeight: 400,
          color: "#f2efe8",
          fontSize: 20,
          letterSpacing: 0.3,
        },
      }),
      T(
        30,
        154,
        150,
        40,
        "出品：青禾摄影社\n摄影 / 文字：林　远　苏　晴\n装帧设计：学生美术社\n二〇二五年春",
        "issue",
        { style: { color: "#c9c2af", fontSize: 9, lineHeight: 1.9 } },
      ),
    ],
    GREEN,
  );
  return docFrom({
    name: "山居茶事 · 电子画册",
    kind: "album",
    width: W,
    height: H,
    sizeLabel: "大 16 开画册",
    margins: { top: 20, right: 24, bottom: 20, left: 24 },
    pages: [cover, toc, p3, p4, p5, back],
  });
}

// ---------- 校刊（A4 210 × 297） ----------
function schoolMagazine(): Doc {
  const W = 210;
  const H = 297;
  const NAVY = "#1d3557";
  const cover = page(
    [
      I(0, 0, W, 180, "campus", { fy: 0.6 }),
      T(20, 192, 170, 30, "青春纪", "masthead", {
        style: {
          fontFamily: "xiaowei",
          fontSize: 64,
          color: NAVY,
          align: "left",
          letterSpacing: 0.15,
        },
      }),
      T(20, 226, 170, 8, "青禾中学学生会刊　·　2025 春季号　·　总第 12 期", "issue", {
        style: { align: "left", color: NAVY, letterSpacing: 0.1 },
      }),
      L(20, 240, 170, NAVY, 0.6),
      T(
        20,
        246,
        120,
        34,
        "本期专题\n书香校园：一座图书馆，点亮整个春天\n劳动教育：在“开心农场”里读懂一粒种子",
        "body",
        {
          style: {
            fontFamily: "sans",
            fontSize: 9.5,
            indent: 0,
            align: "left",
            color: NAVY,
            lineHeight: 1.7,
          },
        },
      ),
      R(160, 252, 30, 30, NAVY),
      T(160, 252, 30, 30, "NO.\n12", "issue", {
        verticalAlign: "middle",
        style: { color: "#ffffff", fontSize: 12, fontWeight: 700, lineHeight: 1.2 },
      }),
    ],
    "#f7f5f0",
  );
  const p2 = page([
    T(24, 26, 100, 16, "卷首语", "headline", {
      style: { align: "left", fontSize: 28, color: NAVY },
    }),
    T(24, 44, 100, 7, "PREFACE", "issue", {
      style: { align: "left", letterSpacing: 0.4, color: "#6b7a90" },
    }),
    I(24, 60, 162, 90, "reading", { fy: 0.4 }),
    T(24, 160, 162, 110, A.essay, "body", {
      columns: 2,
      columnGap: 8,
      style: { fontFamily: "kai", fontSize: 10.5, lineHeight: 1.75 },
    }),
    T(24, 274, 162, 6, "— 学生会宣传部 —", "byline", { style: { align: "right" } }),
  ]);
  const p3 = page([
    R(0, 0, W, 10, NAVY),
    T(24, 18, 162, 7, "专题 · 书香校园", "folio", { style: { color: NAVY } }),
    T(24, 28, 162, 26, A.leadTitle, "headline", {
      style: { align: "left", fontSize: 24, color: NAVY },
    }),
    T(24, 56, 162, 26, A.leadIntro, "lead"),
    I(24, 86, 78, 100, "library"),
    T(24, 188, 78, 10, "新图书馆阅览区", "caption"),
    T(108, 86, 78, 186, A.leadBody.split("\n").slice(0, 5).join("\n"), "body", {
      style: { fontSize: 9 },
    }),
    T(24, 202, 78, 70, "“在书架之间走一走，常常会遇见意想不到的自己。”", "lead", {
      verticalAlign: "middle",
      style: { fontSize: 14, indent: 0, color: NAVY, lineHeight: 1.6 },
    }),
  ]);
  const back = page(
    [
      T(24, 120, 162, 10, "编委会", "subhead", {
        style: { color: "#ffffff", align: "center", fontSize: 14 },
      }),
      T(
        24,
        136,
        162,
        50,
        "顾问：张　岚　李　默\n主编：苏　晴\n编辑：林晓雨　陈思远　王子航　何　川\n美编：学生美术社",
        "issue",
        { style: { color: "#c8d2e0", fontSize: 10, lineHeight: 2 } },
      ),
      T(24, 260, 162, 8, "青禾中学学生会　·　内部交流资料", "issue", {
        style: { color: "#8fa0b8" },
      }),
    ],
    NAVY,
  );
  return docFrom({
    name: "青春纪 · 校刊春季号",
    kind: "magazine",
    width: W,
    height: H,
    sizeLabel: "A4",
    margins: { top: 20, right: 24, bottom: 20, left: 24 },
    pages: [cover, p2, p3, back],
  });
}

// ---------- 图文手册（A5 148 × 210） ----------
function freshmanGuide(): Doc {
  const W = 148;
  const H = 210;
  const TEAL = "#0f5c5a";
  const cover = page([
    I(0, 0, W, 120, "campus-lawn"),
    R(0, 120, W, 90, TEAL),
    T(14, 132, 120, 14, "新生入学指南", "headline", {
      style: { color: "#ffffff", fontFamily: "sans", fontWeight: 700, fontSize: 24, align: "left" },
    }),
    T(14, 150, 120, 7, "FRESHMAN HANDBOOK 2025", "issue", {
      style: { color: "#bfe0dc", align: "left", letterSpacing: 0.2 },
    }),
    L(14, 162, 30, "#ffffff", 0.5),
    T(14, 186, 120, 8, "青禾中学　·　2025 级", "issue", {
      style: { color: "#ffffff", align: "left", fontSize: 9.5 },
    }),
  ]);
  const p2 = page([
    T(14, 16, 120, 10, "欢迎你，新同学", "subhead", { style: { fontSize: 16, color: TEAL } }),
    T(14, 30, 120, 30, A.guideIntro, "lead", { style: { fontSize: 10 } }),
    R(14, 64, 120, 8, TEAL),
    T(17, 64, 100, 8, "报到须知", "column", { verticalAlign: "middle", style: { fontSize: 10 } }),
    T(14, 76, 120, 70, A.guideItems, "body", {
      style: {
        fontFamily: "sans",
        fontSize: 9,
        indent: 0,
        align: "left",
        lineHeight: 1.6,
        spaceAfter: 3,
      },
    }),
    R(14, 152, 120, 42, "#eef5f4"),
    T(
      18,
      156,
      112,
      34,
      "温馨提示：报到当天校园内车辆较多，请家长按指引停车。新生可凭录取通知书在校门口领取校园卡和宿舍钥匙。",
      "body",
      { style: { fontFamily: "kai", fontSize: 9, indent: 0 } },
    ),
    T(14, 198, 120, 5, "— 2 —", "issue", { style: { fontSize: 7, color: "#888888" } }),
  ]);
  const p3 = page([
    T(14, 16, 120, 10, "认识校园", "subhead", { style: { fontSize: 16, color: TEAL } }),
    I(14, 30, 120, 70, "campus"),
    T(14, 101, 120, 7, "▲ 香樟大道尽头的红砖建筑就是新图书馆", "caption"),
    T(14, 112, 120, 82, A.guideCampus, "body", { style: { fontSize: 9 } }),
    T(14, 198, 120, 5, "— 3 —", "issue", { style: { fontSize: 7, color: "#888888" } }),
  ]);
  const back = page(
    [
      T(14, 70, 120, 10, "常用联系方式", "subhead", {
        style: { color: "#ffffff", align: "center" },
      }),
      T(
        14,
        86,
        120,
        50,
        "教务处　0000-1234501\n学生处　0000-1234502\n校医室　0000-1234503\n宿管中心　0000-1234504",
        "issue",
        { style: { color: "#d6ebe8", fontSize: 9.5, lineHeight: 2 } },
      ),
      T(14, 186, 120, 7, "青禾中学学生处 编印", "issue", {
        style: { color: "#9cc8c3", fontSize: 8 },
      }),
    ],
    TEAL,
  );
  return docFrom({
    name: "新生入学指南",
    kind: "manual",
    width: W,
    height: H,
    sizeLabel: "A5",
    margins: { top: 14, right: 14, bottom: 14, left: 14 },
    pages: [cover, p2, p3, back],
  });
}

// ---------- 横版旅行画册（297 × 210） ----------
function travelAlbum(): Doc {
  const W = 297;
  const H = 210;
  const BROWN = "#5b3a29";
  const cover = page(
    [
      I(0, 0, 148.5, H, "alley"),
      T(170, 60, 110, 30, "古镇行旅", "masthead", {
        style: {
          fontFamily: "mashan",
          fontSize: 54,
          color: BROWN,
          align: "left",
          letterSpacing: 0.1,
        },
      }),
      T(170, 94, 110, 8, "石阶、巷陌与一盏灯", "kicker", {
        style: { align: "left", color: "#7a5a48", fontSize: 13 },
      }),
      L(170, 110, 40, BROWN, 0.5),
      T(170, 170, 110, 8, "旅行摄影小册　·　第一辑", "issue", {
        style: { align: "left", color: "#7a5a48" },
      }),
    ],
    "#f5efe6",
  );
  const p2 = page([
    I(18, 18, 120, 174, "steps"),
    T(156, 26, 120, 14, "石阶上的清晨", "headline", {
      style: { align: "left", fontSize: 22, color: BROWN },
    }),
    T(
      156,
      46,
      123,
      146,
      "天还没亮透，石板路被夜雨洗得发亮。早起的老人提着竹篮去集市，木门吱呀一声打开，炊烟从屋檐下慢慢升起。\n沿着石阶往上走，两侧是层层叠叠的老屋。灰瓦白墙，木窗雕花，门楣上的春联褪了颜色，字迹却依然清晰。转过一个弯，巷子忽然开阔起来，一棵老榕树下，几位老人正在喝早茶、聊家常。\n在这里，时间仿佛被拉得很长。没有人赶路，每一步都可以慢慢走。",
      "body",
      {
        columns: 1,
        style: { fontSize: 10.5, lineHeight: 1.85 },
      },
    ),
  ]);
  const p3 = page([
    I(0, 0, W, H, "zhangjiajie"),
    R(0, 168, W, 42, "#000000", null, { opacity: 0.4 }),
    T(24, 176, 249, 12, "云海与峰林", "subhead", { style: { color: "#ffffff", fontSize: 16 } }),
    T(
      24,
      190,
      249,
      12,
      "傍晚时分，雾气从山谷升起，砂岩峰林在云海中若隐若现，像一幅缓缓展开的水墨长卷。",
      "caption",
      { style: { color: "#eeeeee", fontSize: 9 } },
    ),
  ]);
  const back = page(
    [
      T(48, 90, 200, 14, "下一站，再见", "headline", {
        style: { fontFamily: "mashan", fontWeight: 400, color: "#f5efe6", fontSize: 30 },
      }),
      T(48, 112, 200, 8, "摄影 / 文字：林　远", "issue", { style: { color: "#d8c6b5" } }),
    ],
    BROWN,
  );
  return docFrom({
    name: "古镇行旅 · 横版画册",
    kind: "album",
    width: W,
    height: H,
    sizeLabel: "横版 A4",
    margins: { top: 18, right: 18, bottom: 18, left: 18 },
    pages: [cover, p2, p3, back],
  });
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "campus-paper",
    name: "青禾校园报 · 四版",
    category: "newspaper",
    description: "报头、期号、跨栏标题、多栏正文、照片与图片说明，四个版面完整示范校园报排版。",
    width: 270,
    height: 390,
    sizeName: "四开报纸",
    build: campusPaper,
  },
  {
    id: "tea-album",
    name: "山居茶事 · 电子画册",
    category: "album",
    description: "封面、可编辑目录页、图文内页与封底，适合摄影集与活动纪念册。",
    width: 210,
    height: 285,
    sizeName: "大 16 开画册",
    build: teaAlbum,
  },
  {
    id: "school-magazine",
    name: "青春纪 · 校刊",
    category: "magazine",
    description: "封面、卷首语、专题文章与编委会封底的校刊结构。",
    width: 210,
    height: 297,
    sizeName: "A4",
    build: schoolMagazine,
  },
  {
    id: "freshman-guide",
    name: "新生入学指南 · 手册",
    category: "manual",
    description: "小开本图文手册：欢迎页、报到须知、校园介绍与联系方式。",
    width: 148,
    height: 210,
    sizeName: "A5",
    build: freshmanGuide,
  },
  {
    id: "travel-album",
    name: "古镇行旅 · 横版画册",
    category: "album",
    description: "横向版式的旅行摄影小册，大图与文字分栏搭配。",
    width: 297,
    height: 210,
    sizeName: "横版 A4",
    build: travelAlbum,
  },
];

/** Lazily built template documents (for previews). */
const built = new Map<string, Doc>();
export function templateDoc(id: string): Doc {
  let d = built.get(id);
  if (!d) {
    d = TEMPLATES.find((t) => t.id === id)!.build();
    built.set(id, d);
  }
  return d;
}
