// modules/reporting/generators/word-report.generator.ts
// ASSUMPTION: uses the `docx` package (produces real OOXML .docx). Confirm
// it's in package.json. See the ExecutionFormat note above about the
// pre-existing 'doc' extension/mime mismatch in report-execution.service.ts.

import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel } from 'docx';
import { ReportResult } from '../types/report-definition.types';

export async function buildWordBuffer(title: string, result: ReportResult): Promise<Buffer> {
  const headerRow = new TableRow({
    children: result.columns.map(
      (col) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: col.label, bold: true })] })],
        })
    ),
  });

  const dataRows = result.rows.map(
    (row) =>
      new TableRow({
        children: result.columns.map((col) => {
          const value = row[col.key];
          const text = value instanceof Date ? value.toLocaleDateString() : String(value ?? '');
          return new TableCell({ children: [new Paragraph(text)] });
        }),
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `Generated ${new Date().toLocaleString()}`, spacing: { after: 200 } }),
          new Table({ rows: [headerRow, ...dataRows] }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}