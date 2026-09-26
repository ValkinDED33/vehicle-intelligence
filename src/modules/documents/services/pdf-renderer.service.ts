import { Injectable } from "@nestjs/common";
import { createCanvas } from "@napi-rs/canvas";

export interface RenderedPdfPage {
  pageNumber: number;
  mimeType: "image/png";
  buffer: Buffer;
}

export interface RenderedPdfBatch {
  firstPage: number;
  lastPage: number;
  totalPages: number;
  pages: RenderedPdfPage[];
}

@Injectable()
export class PdfRendererService {
  private static readonly SCALE = 1.6;
  private static readonly MAX_PAGES = 40;
  private static readonly MAX_PIXELS = 4000 * 4000;

  async *renderBatches(
    pdfBuffer: Buffer,
    batchSize = 5,
  ): AsyncGenerator<RenderedPdfBatch> {
    if (pdfBuffer.length === 0) {
      throw new Error("PDF buffer is empty");
    }

    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("PDF render batch size must be a positive integer");
    }

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
    });

    const pdf = await loadingTask.promise;

    if (pdf.numPages === 0) {
      throw new Error("PDF contains no pages");
    }

    const totalPages = Math.min(pdf.numPages, PdfRendererService.MAX_PAGES);

    for (let firstPage = 1; firstPage <= totalPages; firstPage += batchSize) {
      const lastPage = Math.min(firstPage + batchSize - 1, totalPages);

      const pages: RenderedPdfPage[] = [];

      for (
        let pageNumber = firstPage;
        pageNumber <= lastPage;
        pageNumber += 1
      ) {
        const page = await pdf.getPage(pageNumber);

        try {
          const baseViewport = page.getViewport({ scale: 1 });
          const basePixels = baseViewport.width * baseViewport.height;
          const scale =
            basePixels > PdfRendererService.MAX_PIXELS
              ? Math.sqrt(PdfRendererService.MAX_PIXELS / basePixels)
              : PdfRendererService.SCALE;

          const viewport = page.getViewport({ scale });

          const canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );

          const context = canvas.getContext("2d");

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
          } as never).promise;

          pages.push({
            pageNumber,
            mimeType: "image/png",
            buffer: canvas.toBuffer("image/png"),
          });
        } finally {
          page.cleanup();
        }
      }

      yield {
        firstPage,
        lastPage,
        totalPages: pdf.numPages,
        pages,
      };
    }
  }
}
