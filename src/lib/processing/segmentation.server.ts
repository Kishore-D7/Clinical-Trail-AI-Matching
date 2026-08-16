import { DEFAULT_CHUNK_CONFIG, type ChunkConfig } from "@/lib/processing/types";
import type { PageText } from "@/lib/processing/pdf.server";

/**
 * PatientSegmentationService — splits extracted page text into per-patient segments.
 * Strategies are pluggable so other formats can be supported later without
 * touching the pipeline.
 */
export type PatientSegment = {
  index: number;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  strategy: string;
};

export type SegmentationStrategy = {
  name: string;
  /** Rough score (0-1) of how well this strategy fits the document. */
  detect: (pages: PageText[]) => number;
  segment: (pages: PageText[], config: ChunkConfig) => PatientSegment[];
};

type Chunk = { pageStart: number; pageEnd: number; text: string; chunkIndex: number };

/** Character-window chunking with overlap and page-number tracking. */
export function chunkPages(pages: PageText[], config: ChunkConfig): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer = "";
  let pageStart = pages[0]?.page ?? 1;
  let pageEnd = pageStart;
  let chunkIndex = 0;

  const flush = () => {
    const text = buffer.trim();
    if (!text) return;
    chunks.push({ text, pageStart, pageEnd, chunkIndex: chunkIndex++ });
    const overlap = config.chunkOverlap > 0 ? buffer.slice(-config.chunkOverlap) : "";
    buffer = overlap;
    pageStart = pageEnd;
  };

  for (const page of pages) {
    if (!page.text) continue;
    pageEnd = page.page;
    buffer += `\n[[page:${page.page}]]\n${page.text}`;
    if (buffer.length >= config.chunkSize) flush();
  }
  buffer = buffer.trim();
  if (buffer) chunks.push({ text: buffer, pageStart, pageEnd, chunkIndex: chunkIndex++ });
  return chunks;
}

const BOUNDARY_PATTERNS = [
  /^\s*patient\s*(id|no\.?|number|record)\s*[:#-]/i,
  /^\s*patient\s*(name)?\s*[:#-]/i,
  /^\s*mrn\s*[:#-]/i,
  /^\s*medical\s+record\s+number\s*[:#-]/i,
  /^\s*record\s+\d+\s*(of\s+\d+)?\s*$/i,
  /^\s*(subject|participant)\s*(id)?\s*[:#-]/i,
  /^\s*={3,}\s*$/,
  /^\s*-{5,}\s*$/,
];

function isBoundary(line: string) {
  return BOUNDARY_PATTERNS.some((pattern) => pattern.test(line));
}

function pageOfOffset(text: string, offset: number, fallback: number) {
  const before = text.slice(0, offset);
  const matches = before.match(/\[\[page:(\d+)\]\]/g);
  const last = matches?.[matches.length - 1];
  if (!last) return fallback;
  return Number(last.replace(/\D/g, "")) || fallback;
}

function cleanSegment(text: string, max: number) {
  return text
    .replace(/\[\[page:\d+\]\]/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Default heuristic: split on common patient-record headers. */
const headerStrategy: SegmentationStrategy = {
  name: "heuristic-headers-v1",
  detect: (pages) => {
    const sample = pages.slice(0, 5).flatMap((p) => p.text.split("\n"));
    const hits = sample.filter(isBoundary).length;
    return hits > 0 ? Math.min(1, hits / 5) : 0;
  },
  segment: (pages, config) => {
    const segments: PatientSegment[] = [];
    let index = 0;
    for (const chunk of chunkPages(pages, config)) {
      const lines = chunk.text.split("\n");
      const starts: number[] = [];
      let offset = 0;
      lines.forEach((line) => {
        if (isBoundary(line) && offset > 0) starts.push(offset);
        offset += line.length + 1;
      });
      const bounds = [0, ...starts, chunk.text.length];
      for (let i = 0; i < bounds.length - 1; i += 1) {
        const start = bounds[i]!;
        const end = bounds[i + 1]!;
        const raw = chunk.text.slice(start, end);
        const content = cleanSegment(raw, config.maxSegmentChars);
        if (content.length < 40) continue;
        segments.push({
          index: index++,
          chunkIndex: chunk.chunkIndex,
          pageStart: pageOfOffset(chunk.text, start, chunk.pageStart),
          pageEnd: pageOfOffset(chunk.text, end, chunk.pageEnd),
          content,
          strategy: headerStrategy.name,
        });
      }
    }
    return segments;
  },
};

/** Fallback: treat each chunk as one segment when no patient headers are found. */
const chunkStrategy: SegmentationStrategy = {
  name: "chunk-fallback-v1",
  detect: () => 0.1,
  segment: (pages, config) =>
    chunkPages(pages, config)
      .map((chunk, index) => ({
        index,
        chunkIndex: chunk.chunkIndex,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        content: cleanSegment(chunk.text, config.maxSegmentChars),
        strategy: chunkStrategy.name,
      }))
      .filter((segment) => segment.content.length >= 40),
};

const STRATEGIES: SegmentationStrategy[] = [headerStrategy, chunkStrategy];

export const PatientSegmentationService = {
  strategies: STRATEGIES,
  register(strategy: SegmentationStrategy) {
    STRATEGIES.unshift(strategy);
  },
  segment(pages: PageText[], config: ChunkConfig = DEFAULT_CHUNK_CONFIG) {
    const ranked = [...STRATEGIES].sort((a, b) => b.detect(pages) - a.detect(pages));
    for (const strategy of ranked) {
      const segments = strategy.segment(pages, config);
      if (segments.length > 0) return { strategy: strategy.name, segments };
    }
    return { strategy: "none", segments: [] as PatientSegment[] };
  },
};
