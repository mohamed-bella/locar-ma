// Server-only. Registers an Arabic-capable font for the contract PDF so Darija /
// Arabic client names, addresses and (future) Arabic labels render real glyphs
// instead of tofu. @react-pdf's built-in Helvetica has no Arabic coverage.
//
// Imported at the TOP of ContractPDF so this side-effect runs BEFORE that
// module's StyleSheet.create reads `pdfFont`. If the TTFs aren't present at
// runtime we silently keep Helvetica — the PDF must never fail to render.
import { Font } from '@react-pdf/renderer'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Bold is registered as its OWN family (mirrors the Helvetica / Helvetica-Bold
// split the styles already use — no fontWeight juggling needed).
export const pdfFont = { regular: 'Helvetica', bold: 'Helvetica-Bold' }

try {
  const dir = path.join(process.cwd(), 'public', 'fonts')
  const reg = path.join(dir, 'Tajawal-Regular.ttf')
  const bold = path.join(dir, 'Tajawal-Bold.ttf')
  if (existsSync(reg) && existsSync(bold)) {
    Font.register({ family: 'Tajawal', src: reg })
    Font.register({ family: 'Tajawal-Bold', src: bold })
    // Arabic must not be hyphen-split; return the word whole.
    Font.registerHyphenationCallback((word) => [word])
    pdfFont.regular = 'Tajawal'
    pdfFont.bold = 'Tajawal-Bold'
  }
} catch {
  // Keep Helvetica — better a Latin-only PDF than a crash.
}
