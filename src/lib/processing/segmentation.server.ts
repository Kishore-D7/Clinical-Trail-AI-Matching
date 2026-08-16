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
      let previousWasBoundary = false;
      lines.forEach((line) => {
        const boundary = isBoundary(line);
        // A header block ("Patient ID:" immediately followed by "Patient Name:",
        // "MRN:", ...) describes ONE patient, so only its first line starts a record.
        if (boundary && !previousWasBoundary && offset > 0) starts.push(offset);
        if (line.trim()) previousWasBoundary = boundary;
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
          pageEnd: pageOfOffset(chunk.text, Math.max(start, end - 1), chunk.pageEnd),
          content,
          strategy: headerStrategy.name,
        });
      }
    }
    return segments;
  },
};

/**
 * Identifier strategy: for narrative/unstructured documents where patients are
 * introduced inside prose ("Patient record P-3001 concerns ...", "MRN-3003 refers to ...").
 * A new segment starts when a paragraph mentions a patient identifier that is
 * different from the current one; paragraphs without an identifier are treated
 * as continuations of the current patient.
 */
const IDENTIFIER_PATTERNS = [
  /\b(?:patient\s*(?:id|no\.?|number|identifier)|mrn|subject\s*id|participant\s*id)\s*[:#-]?\s*([A-Z]{0,4}[-_]?[A-Z0-9]{2,}[-_]?[A-Z0-9]+)\b/gi,
  /\b((?:P|PT|MRN|SUBJ|PID)[-_]\s?[A-Z0-9]{2,}(?:[-_][A-Z0-9]+)*)\b/g,
];

function identifiersIn(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of IDENTIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = (match[1] ?? "").replace(/\s+/g, "").toUpperCase();
      if (value.length >= 3 && /\d/.test(value)) found.add(value);
    }
  }
  return [...found];
}

const identifierStrategy: SegmentationStrategy = {
  name: "narrative-identifiers-v1",
  detect: (pages) => {
    const text = pages
      .slice(0, 6)
      .map((p) => p.text)
      .join("\n");
    const distinct = identifiersIn(text).length;
    if (distinct < 2) return 0;
    return Math.min(1, 0.5 + distinct / 20);
  },
  segment: (pages, config) => {
    const segments: PatientSegment[] = [];
    const seenIds = new Set<string>();
    const emitted = new Set<string>();
    let index = 0;

    // A "block" is a paragraph. Extracted PDF text often has no blank lines, so
    // blocks also break on short heading-like lines ("Patient Narrative 7").
    const isHeading = (line: string) => {
      const value = line.trim();
      if (!value || value.length > 80) return false;
      if (/^(patient|case|record|subject|participant|narrative)\b[^.]{0,60}\d+$/i.test(value)) {
        return true;
      }
      return /^[A-Z][A-Za-z][A-Za-z \-—]{2,60}$/.test(value);
    };

    for (const chunk of chunkPages(pages, config)) {
      const blocks: { text: string; offset: number }[] = [];
      let offset = 0;
      for (const line of chunk.text.split("\n")) {
        const last = blocks[blocks.length - 1];
        if (!last || isHeading(line) || !line.trim()) {
          blocks.push({ text: line, offset });
        } else {
          last.text += `\n${line}`;
        }
        offset += line.length + 1;
      }

      type Group = { start: number; end: number; ids: Set<string>; text: string };
      const groups: Group[] = [];
      for (const block of blocks) {
        if (!block.text.trim()) continue;
        const ids = identifiersIn(block.text);
        const current = groups[groups.length - 1];
        // Only an identifier that has never appeared before starts a new patient;
        // back-references ("possible duplicate of P-3001") stay with the current record.
        const introduces = ids.filter((id) => !seenIds.has(id));
        if (introduces.length > 0 || !current) {
          if (introduces.length === 0) continue; // leading admin text, no patient yet
          introduces.forEach((id) => seenIds.add(id));
          groups.push({
            start: block.offset,
            end: block.offset + block.text.length,
            ids: new Set(introduces),
            text: block.text,
          });
        } else {
          current.end = block.offset + block.text.length;
          current.text += `\n${block.text}`;
        }
      }

      for (const group of groups) {
        const content = cleanSegment(group.text, config.maxSegmentChars);
        if (content.length < 40) continue;
        const key = [...group.ids].sort().join("|");
        if (emitted.has(key)) continue;
        emitted.add(key);
        segments.push({
          index: index++,
          chunkIndex: chunk.chunkIndex,
          pageStart: pageOfOffset(chunk.text, group.start, chunk.pageStart),
          pageEnd: pageOfOffset(chunk.text, Math.max(group.start, group.end - 1), chunk.pageEnd),
          content,
          strategy: identifierStrategy.name,
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

const STRATEGIES: SegmentationStrategy[] = [headerStrategy, identifierStrategy, chunkStrategy];


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
