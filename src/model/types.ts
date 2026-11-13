/** Project format version. Bump when the document schema changes incompatibly. */
export const FORMAT_VERSION = 1;

export type Align = "left" | "center" | "right" | "justify";
export type FontWeight = 400 | 700 | 900;

export interface TextStyle {
  fontFamily: string;
  /** points */
  fontSize: number;
  fontWeight: FontWeight;
  italic: boolean;
  underline: boolean;
  color: string;
  align: Align;
  /** multiple of font size */
  lineHeight: number;
  /** em */
  letterSpacing: number;
  /** points */
  spaceBefore: number;
  /** points */
  spaceAfter: number;
  /** characters (em) */
  indent: number;
}

export interface TextStylePreset {
  id: string;
  name: string;
  style: TextStyle;
}

export interface Stroke {
  color: string;
  /** mm */
  width: number;
  dash: "solid" | "dashed" | "dotted" | "double";
}

interface BaseElement {
  id: string;
  name?: string;
  /** mm, top-left of the unrotated frame */
  x: number;
  y: number;
  w: number;
  h: number;
  /** degrees, clockwise, around the frame centre */
  rotation: number;
  opacity: number;
  locked?: boolean;
  hidden?: boolean;
  groupId?: string;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  style: TextStyle;
  styleId?: string;
  columns: number;
  /** mm */
  columnGap: number;
  columnRule?: boolean;
  /** mm */
  padding: number;
  verticalAlign: "top" | "middle" | "bottom";
  fill: string | null;
  stroke: Stroke | null;
}

export interface ImageElement extends BaseElement {
  type: "image";
  assetId: string | null;
  /** image content rectangle relative to the frame, mm (frame clips it) */
  crop: { x: number; y: number; w: number; h: number };
  keepRatio: boolean;
  radius: number;
  stroke: Stroke | null;
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: "rect" | "ellipse" | "line";
  fill: string | null;
  stroke: Stroke | null;
  radius: number;
}

export type PageElement = TextElement | ImageElement | ShapeElement;
export type ElementType = PageElement["type"];

export interface Page {
  id: string;
  background: string;
  elements: PageElement[];
  guides: { x: number[]; y: number[] };
}

export interface AssetMeta {
  id: string;
  mime: string;
  width: number;
  height: number;
  name: string;
  size: number;
}

export type DocKind = "newspaper" | "magazine" | "album" | "manual" | "blank";

export interface Doc {
  formatVersion: number;
  id: string;
  name: string;
  kind: DocKind;
  /** single page size, mm */
  pageSize: { width: number; height: number };
  sizeLabel?: string;
  margins: { top: number; right: number; bottom: number; left: number };
  pages: Page[];
  textStyles: TextStylePreset[];
  assets: Record<string, AssetMeta>;
  createdAt: number;
  updatedAt: number;
}
