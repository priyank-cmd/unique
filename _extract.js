import PDFParser from 'pdf2json'
import { readFileSync } from 'fs'
const buf = readFileSync('./pdfs/srs.pdf')
const p = new PDFParser(null, 1)
p.on('pdfParser_dataReady', () => {
  const t = p.getRawTextContent()
  console.log(t.slice(0, 3500))
})
p.on('pdfParser_dataError', e => console.error(e))
p.parseBuffer(buf, 0)
