import { renderToBuffer } from '@react-pdf/renderer'
import { ContractPDF, type ContractPdfData } from '~/components/pdf/ContractPDF'

// Server-only. Rendered lazily (dynamic import) so @react-pdf never reaches the client.
export async function renderContractPdf(data: ContractPdfData): Promise<Buffer> {
  return renderToBuffer(<ContractPDF data={data} />)
}
