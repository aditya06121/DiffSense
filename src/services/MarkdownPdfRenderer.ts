import PDFDocument from 'pdfkit';
import { PRDData } from './PRDGeneratorService';

export class MarkdownPdfRenderer {
  private doc: typeof PDFDocument;
  private readonly pageWidth = 595.28; // A4 width
  private readonly pageHeight = 841.89; // A4 height
  private readonly margin = 40;
  private readonly contentWidth = 515.28; // 595.28 - 80

  constructor(doc: any) {
    this.doc = doc;
  }

  private ensureSpace(neededHeight: number): void {
    if (this.doc.y + neededHeight > this.pageHeight - this.margin - 25) {
      this.doc.addPage();
    }
  }

  /**
   * Renders the top metadata banner for the PRD.
   */
  public renderHeader(data: PRDData): void {
    const doc = this.doc;

    // Title
    doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold').text('PRODUCT REQUIREMENT DOCUMENT', 40, 40);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#2563eb').text('Technical Specification & Architecture Review', { align: 'left' });
    doc.moveDown(0.4);

    // Metadata Card Box
    const startY = doc.y;
    const boxHeight = 70;
    doc.roundedRect(40, startY, this.contentWidth, boxHeight, 6).fillAndStroke('#f8fafc', '#cbd5e1');

    doc.fillColor('#334155').fontSize(9).font('Helvetica');
    doc.text(`Repository: ${data.repoId}`, 52, startY + 10);
    if (data.prNumber) {
      doc.font('Helvetica-Bold').fillColor('#0284c7').text(`Pull Request: #${data.prNumber}`, 300, startY + 10);
    }
    doc.font('Helvetica').fillColor('#334155').text(`Commit SHA: ${data.commitSha}`, 52, startY + 24);
    doc.text(`Author: ${data.authorName}`, 52, startY + 38);
    doc.text(`Generated: ${data.createdAt}`, 300, startY + 38);
    doc.text(
      `Diff Summary: ${data.summary.totalFiles} files changed  (+${data.summary.totalAdditions} additions, -${data.summary.totalDeletions} deletions)`,
      52,
      startY + 52
    );

    doc.y = startY + boxHeight + 15;
  }

  /**
   * Main entry point to parse and render Markdown content.
   */
  public renderMarkdown(markdown: string): void {
    const rawLines = markdown.split('\n');
    let i = 0;

    while (i < rawLines.length) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // 1. Code Block / Diagram: ```
      if (trimmed.startsWith('```')) {
        const lang = trimmed.substring(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < rawLines.length && !rawLines[i].trim().startsWith('```')) {
          codeLines.push(rawLines[i]);
          i++;
        }
        i++; // skip closing ```
        this.renderCodeBlock(codeLines, lang);
        continue;
      }

      // 2. Table: lines with |
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
        const tableLines: string[] = [];
        while (i < rawLines.length && rawLines[i].trim().startsWith('|') && rawLines[i].trim().endsWith('|')) {
          tableLines.push(rawLines[i].trim());
          i++;
        }
        this.renderTable(tableLines);
        continue;
      }

      // 3. Blockquote: >
      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < rawLines.length && rawLines[i].trim().startsWith('>')) {
          quoteLines.push(rawLines[i].trim().replace(/^>\s*/, ''));
          i++;
        }
        this.renderBlockquote(quoteLines);
        continue;
      }

      // 4. Horizontal Rule: --- or ***
      if (/^[-*_]{3,}$/.test(trimmed)) {
        this.renderHorizontalRule();
        i++;
        continue;
      }

      // 5. Headings
      if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        this.renderHeading1(trimmed.replace(/^#\s+/, ''));
        i++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        this.renderHeading2(trimmed.replace(/^##\s+/, ''));
        i++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        this.renderHeading3(trimmed.replace(/^###\s+/, ''));
        i++;
        continue;
      }
      if (trimmed.startsWith('#### ')) {
        this.renderHeading4(trimmed.replace(/^####\s+/, ''));
        i++;
        continue;
      }

      // 6. Unordered List Items: * or -
      if (/^[*+-]\s+/.test(trimmed)) {
        const bulletText = trimmed.replace(/^[*+-]\s+/, '');
        this.renderListItem(bulletText, 'bullet');
        i++;
        continue;
      }

      // 7. Ordered List Items: 1. 2. etc.
      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (orderedMatch) {
        this.renderListItem(orderedMatch[2], orderedMatch[1]);
        i++;
        continue;
      }

      // 8. Standalone Math formula block: $$...$$
      if (trimmed.startsWith('$$') || trimmed.endsWith('$$')) {
        const cleanFormula = trimmed.replace(/\$\$/g, '').trim();
        if (cleanFormula) {
          this.renderFormulaBlock(cleanFormula);
        }
        i++;
        continue;
      }

      // 9. Standard Paragraph (if not empty)
      if (trimmed.length > 0) {
        this.renderParagraph(trimmed);
      } else {
        // Subtle vertical breathing room on empty lines
        this.doc.moveDown(0.25);
      }

      i++;
    }
  }

  private renderHeading1(text: string): void {
    this.ensureSpace(45);
    this.doc.moveDown(0.8);
    this.doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(text, 40);
    this.doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(40, this.doc.y + 2).lineTo(40 + this.contentWidth, this.doc.y + 2).stroke();
    this.doc.moveDown(0.4);
  }

  private renderHeading2(text: string): void {
    this.ensureSpace(35);
    this.doc.moveDown(0.7);
    this.doc.fillColor('#1e40af').fontSize(12.5).font('Helvetica-Bold').text(text, 40);
    this.doc.strokeColor('#f1f5f9').lineWidth(0.75).moveTo(40, this.doc.y + 2).lineTo(40 + this.contentWidth, this.doc.y + 2).stroke();
    this.doc.moveDown(0.3);
  }

  private renderHeading3(text: string): void {
    this.ensureSpace(28);
    this.doc.moveDown(0.5);
    this.doc.fillColor('#0f766e').fontSize(10.5).font('Helvetica-Bold').text(text, 40);
    this.doc.moveDown(0.2);
  }

  private renderHeading4(text: string): void {
    this.ensureSpace(22);
    this.doc.moveDown(0.4);
    this.doc.fillColor('#475569').fontSize(9.5).font('Helvetica-Bold').text(text, 40);
    this.doc.moveDown(0.15);
  }

  private renderHorizontalRule(): void {
    this.ensureSpace(15);
    this.doc.moveDown(0.4);
    this.doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(40, this.doc.y).lineTo(40 + this.contentWidth, this.doc.y).stroke();
    this.doc.moveDown(0.4);
  }

  private renderBlockquote(lines: string[]): void {
    const fullText = lines.join(' ');
    this.ensureSpace(35);
    const startY = this.doc.y;

    // Background tint
    this.doc.save();
    this.doc.roundedRect(40, startY, this.contentWidth, 10, 3).fill('#f8fafc'); // placeholder height
    // Left border accent line
    this.doc.rect(40, startY, 3.5, 10).fill('#6366f1');

    this.doc.y = startY + 4;
    this.doc.fillColor('#334155').fontSize(9).font('Helvetica-Oblique').text(fullText, 52, startY + 4, {
      width: this.contentWidth - 20,
    });
    const blockHeight = Math.max(24, this.doc.y - startY + 4);

    // Re-draw background with measured height
    this.doc.roundedRect(40, startY, this.contentWidth, blockHeight, 3).fill('#f8fafc');
    this.doc.rect(40, startY, 3.5, blockHeight).fill('#6366f1');
    this.doc.fillColor('#334155').fontSize(9).font('Helvetica-Oblique').text(fullText, 52, startY + 6, {
      width: this.contentWidth - 20,
    });
    this.doc.restore();

    this.doc.y = startY + blockHeight + 6;
  }

  private renderCodeBlock(lines: string[], _lang?: string): void {
    const rawText = lines.join('\n');
    const lineHeight = 10;
    const estHeight = lines.length * lineHeight + 16;

    if (estHeight < 200) {
      this.ensureSpace(estHeight);
    }

    const startY = this.doc.y;
    const padding = 8;

    // Draw background container
    this.doc.save();
    this.doc.roundedRect(40, startY, this.contentWidth, estHeight, 4).fillAndStroke('#0f172a', '#1e293b');

    this.doc.fillColor('#38bdf8').fontSize(7.5).font('Courier');
    this.doc.text(rawText, 40 + padding, startY + padding, {
      width: this.contentWidth - padding * 2,
      lineGap: 1.5,
    });

    const actualHeight = Math.max(estHeight, this.doc.y - startY + padding);
    this.doc.restore();

    this.doc.y = startY + actualHeight + 8;
  }

  private renderTable(tableLines: string[]): void {
    if (tableLines.length < 2) return;

    // Parse rows & cells
    const rows = tableLines
      .filter((l) => !/^[|\s-:]+$/.test(l)) // filter out delimiter row (| :--- | :--- |)
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim())
      );

    if (rows.length === 0) return;

    const numCols = Math.max(...rows.map((r) => r.length));
    if (numCols === 0) return;

    const colWidth = this.contentWidth / numCols;
    const rowHeight = 20;
    this.ensureSpace(rows.length * rowHeight + 10);

    const startX = 40;
    let currentY = this.doc.y + 4;

    rows.forEach((row, rowIndex) => {
      const isHeader = rowIndex === 0;
      const bgColor = isHeader ? '#f1f5f9' : rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';

      // Background
      this.doc.rect(startX, currentY, this.contentWidth, rowHeight).fillAndStroke(bgColor, '#cbd5e1');

      // Cells
      row.forEach((cellText, colIndex) => {
        const cleanText = cellText.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`(.*?)`/g, '$1');
        const cellX = startX + colIndex * colWidth + 4;

        this.doc
          .fillColor(isHeader ? '#0f172a' : '#334155')
          .fontSize(isHeader ? 8.5 : 8)
          .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .text(cleanText, cellX, currentY + 5, {
            width: colWidth - 8,
            height: rowHeight - 8,
            ellipsis: true,
          });
      });

      currentY += rowHeight;
    });

    this.doc.y = currentY + 8;
  }

  private renderListItem(text: string, type: 'bullet' | string): void {
    this.ensureSpace(18);
    const bulletSymbol = type === 'bullet' ? '•' : `${type}.`;
    const indent = 16;

    const startY = this.doc.y;
    // Bullet marker
    this.doc.fillColor('#2563eb').fontSize(9).font('Helvetica-Bold').text(bulletSymbol, 40 + 4, startY);

    // Text content with inline formatting
    this.doc.y = startY;
    this.renderFormattedInline(text, 40 + indent, this.contentWidth - indent);
    this.doc.moveDown(0.2);
  }

  private renderParagraph(text: string): void {
    this.ensureSpace(18);
    this.renderFormattedInline(text, 40, this.contentWidth);
    this.doc.moveDown(0.35);
  }

  private renderFormulaBlock(formula: string): void {
    this.ensureSpace(28);
    const clean = formula
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\max/g, 'max')
      .replace(/\\left\(/g, '(')
      .replace(/\\right\)/g, ')')
      .replace(/\\lceil/g, 'ceil(')
      .replace(/\\rceil/g, ')')
      .replace(/\\ge/g, '>=')
      .replace(/\\le/g, '<=');

    const startY = this.doc.y;
    this.doc.roundedRect(40, startY, this.contentWidth, 22, 4).fillAndStroke('#f8fafc', '#e2e8f0');
    this.doc.fillColor('#475569').fontSize(8.5).font('Courier-Oblique').text(clean, 52, startY + 6, {
      align: 'center',
      width: this.contentWidth - 24,
    });
    this.doc.y = startY + 28;
  }

  /**
   * Parses inline bold (**text**), inline code (`code`), and italics (*text*)
   * and renders them continuously in PDFKit.
   */
  private renderFormattedInline(rawText: string, xPos: number, width: number): void {
    // Tokenize string by bold **...** and code `...`
    const tokens: Array<{ text: string; bold: boolean; code: boolean; italic: boolean }> = [];
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({
          text: rawText.substring(lastIndex, match.index),
          bold: false,
          code: false,
          italic: false,
        });
      }

      const matchText = match[0];
      if (matchText.startsWith('**') && matchText.endsWith('**')) {
        tokens.push({
          text: matchText.substring(2, matchText.length - 2),
          bold: true,
          code: false,
          italic: false,
        });
      } else if (matchText.startsWith('`') && matchText.endsWith('`')) {
        tokens.push({
          text: matchText.substring(1, matchText.length - 1),
          bold: false,
          code: true,
          italic: false,
        });
      } else if (matchText.startsWith('*') && matchText.endsWith('*')) {
        tokens.push({
          text: matchText.substring(1, matchText.length - 1),
          bold: false,
          code: false,
          italic: true,
        });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < rawText.length) {
      tokens.push({
        text: rawText.substring(lastIndex),
        bold: false,
        code: false,
        italic: false,
      });
    }

    if (tokens.length === 0) {
      return;
    }

    // Render tokens using PDFKit's continued: true
    this.doc.x = xPos;
    tokens.forEach((t, idx) => {
      const isLast = idx === tokens.length - 1;
      const font = t.code ? 'Courier' : t.bold ? 'Helvetica-Bold' : t.italic ? 'Helvetica-Oblique' : 'Helvetica';
      const color = t.code ? '#0284c7' : t.bold ? '#0f172a' : '#334155';
      const size = t.code ? 8.5 : 9;

      this.doc
        .fillColor(color)
        .fontSize(size)
        .font(font)
        .text(t.text, {
          continued: !isLast,
          width,
          lineGap: 2,
        });
    });
  }

  /**
   * Injects page numbers to all buffered pages in the document.
   */
  public addPageNumbers(): void {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);

      // Top running hairline
      this.doc
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .moveTo(40, this.pageHeight - 32)
        .lineTo(40 + this.contentWidth, this.pageHeight - 32)
        .stroke();

      // Footer text
      this.doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text(
        `automation-bit PRD & Tech Spec  •  Page ${i + 1} of ${range.count}`,
        40,
        this.pageHeight - 25,
        { align: 'center', width: this.contentWidth }
      );
    }
  }
}
