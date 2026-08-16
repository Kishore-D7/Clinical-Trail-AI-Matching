/**
 * PdfExtractionService — server-side PDF text extraction.
 * Runs only on the server; the browser never holds the full document text.
 */
export type PageText = { page: number; text: string };

export type PdfExtraction = {
  totalPages: number;
  pages: PageText[];
};

export const PdfExtractionService = {
  async extract(bytes: Uint8Array): Promise<PdfExtraction> {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages: PageText[] = (Array.isArray(text) ? text : [String(text)]).map((value, index) => ({
      page: index + 1,
      text: (value ?? "").replace(/\u0000/g, " ").trim(),
    }));
    return { totalPages: totalPages ?? pages.length, pages };
  },
};
