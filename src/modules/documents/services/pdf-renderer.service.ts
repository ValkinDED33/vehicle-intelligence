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

    for (let firstPage = 1; firstPage <= pdf.numPages; firstPage += batchSize) {
      const lastPage = Math.min(firstPage + batchSize - 1, pdf.numPages);

      const pages: RenderedPdfPage[] = [];

      for (
        let pageNumber = firstPage;
        pageNumber <= lastPage;
        pageNumber += 1
      ) {
        const page = await pdf.getPage(pageNumber);

        try {
          const viewport = page.getViewport({
            scale: PdfRendererService.SCALE,
          });

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
