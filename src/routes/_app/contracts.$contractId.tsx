import { useState } from 'react'
import { createFileRoute, Link, useRouter, notFound } from '@tanstack/react-router'
import { format } from 'date-fns'
import {
  ArrowLeft,
  FileText,
  Download,
  MessageCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getContract,
  updateContract,
  generateContractPdf,
  getContractPdfUrl,
  closeContract,
  type Extra,
} from '~/server/contracts'
import { FUEL_LEVELS, CHECK_STATUSES } from '~/lib/schemas'
import { resBadgeTone } from '~/lib/reservations'
import { waLink } from '~/lib/whatsapp'
import { useI18n } from '~/lib/i18n'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Field,
  Input,
  Select,
  EmptyState,
} from '~/components/ui'

const FUEL_KEY: Record<string, string> = {
  empty: 'con.fuelEmpty',
  quarter: 'con.fuelQuarter',
  half: 'con.fuelHalf',
  three_quarters: 'con.fuelThreeQuarters',
  full: 'con.fuelFull',
}
const CHECK_KEY: Record<string, string> = {
  held: 'con.held',
  released: 'con.released',
  disputed: 'con.disputed',
}

export const Route = createFileRoute('/_app/contracts/$contractId')({
  loader: async ({ params }) => {
    const contract = await getContract({ data: { id: params.contractId } })
    if (!contract) throw notFound()
    return { contract }
  },
  component: ContractDetail,
  pendingComponent: () => (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
    </div>
  ),
  notFoundComponent: ContractNotFound,
})

function ContractNotFound() {
  const { t } = useI18n()
  return (
    <EmptyState
      icon={FileText}
      title={t('con.notFound')}
      action={
        <Link to="/contracts">
          <Button variant="secondary">{t('con.backToContracts')}</Button>
        </Link>
      }
    />
  )
}

function ContractDetail() {
  const { contract: c } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useI18n()

  const [mileageOut, setMileageOut] = useState(c.mileage_out?.toString() ?? '')
  const [mileageIn, setMileageIn] = useState(c.mileage_in?.toString() ?? '')
  const [fuelOut, setFuelOut] = useState(c.fuel_out ?? '')
  const [fuelIn, setFuelIn] = useState(c.fuel_in ?? '')
  const [checkNumber, setCheckNumber] = useState(c.check_number ?? '')
  const [checkBank, setCheckBank] = useState(c.check_bank ?? '')
  const [checkAmount, setCheckAmount] = useState(c.check_amount?.toString() ?? '')
  const [checkStatus, setCheckStatus] = useState(c.check_status)
  const [extras, setExtras] = useState<Extra[]>(c.extras)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const hasPdf = c.has_pdf || !!pdfUrl

  // Contract PDFs live in the private bucket; fetch a short-lived signed URL on
  // demand rather than holding a public link.
  async function ensurePdfUrl(): Promise<string | null> {
    if (pdfUrl) return pdfUrl
    if (!c.has_pdf) return null
    const res = await getContractPdfUrl({ data: { id: c.id } })
    setPdfUrl(res.url)
    return res.url
  }

  async function openPdf() {
    try {
      const url = await ensurePdfUrl()
      if (url) window.open(url, '_blank', 'noopener')
    } catch (err: any) {
      toast.error(err?.message ?? t('con.pdfGenFailed'))
    }
  }

  const closed = Boolean(c.closed_at)

  function payload() {
    return {
      id: c.id,
      mileage_out: mileageOut ? Number(mileageOut) : undefined,
      mileage_in: mileageIn ? Number(mileageIn) : undefined,
      fuel_out: (fuelOut || undefined) as any,
      fuel_in: (fuelIn || undefined) as any,
      check_number: checkNumber || undefined,
      check_bank: checkBank || undefined,
      check_amount: checkAmount ? Number(checkAmount) : undefined,
      check_status: checkStatus as any,
      extras,
    }
  }

  async function save() {
    setSaving(true)
    try {
      await updateContract({ data: payload() })
      toast.success(t('con.saved'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('con.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  async function generate() {
    setGenerating(true)
    try {
      await updateContract({ data: payload() })
      const res = await generateContractPdf({ data: { id: c.id } })
      setPdfUrl(res.url)
      toast.success(t('con.pdfGenerated'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('con.pdfGenFailed'))
    } finally {
      setGenerating(false)
    }
  }

  async function close() {
    if (!confirm(t('con.confirmCloseRental'))) return
    setSaving(true)
    try {
      await updateContract({ data: payload() })
      await closeContract({
        data: { id: c.id, mileage_in: mileageIn ? Number(mileageIn) : undefined, fuel_in: fuelIn || undefined },
      })
      toast.success(t('con.rentalClosed'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('con.couldNotClose'))
    } finally {
      setSaving(false)
    }
  }

  async function sendWhatsApp() {
    let link: string | null = null
    try {
      link = await ensurePdfUrl()
    } catch {
      /* no PDF yet — send without the link */
    }
    const start = c.reservation ? format(new Date(`${c.reservation.date_start}T00:00:00`), 'dd/MM/yyyy') : ''
    const end = c.reservation ? format(new Date(`${c.reservation.date_end}T00:00:00`), 'dd/MM/yyyy') : ''
    const total = c.reservation?.total_amount != null ? `${c.reservation.total_amount.toLocaleString()} MAD` : ''
    const msg =
      `Bonjour ${c.client?.full_name ?? ''}, voici votre contrat de location ${c.agency.name} ` +
      `du ${start} au ${end}. Total: ${total}.` +
      (link ? `\n${link}` : '')
    window.open(waLink(c.client?.phone, msg), '_blank')
  }

  return (
    <div className="max-w-5xl">
      <Link
        to="/contracts"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-4 w-4" /> {t('con.title')}
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-[var(--color-ink)]">#{c.short_id}</h1>
          {c.reservation && <Badge tone={resBadgeTone(c.reservation.status)}>{t(`rstatus.${c.reservation.status}`)}</Badge>}
          {closed && <Badge tone="neutral">{t('con.closedBadge')}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" loading={generating} onClick={generate}>
            <FileText className="h-4 w-4" /> {hasPdf ? t('con.regeneratePdf') : t('con.generatePdf')}
          </Button>
          {hasPdf && (
            <Button variant="secondary" onClick={openPdf}>
              <Download className="h-4 w-4" /> PDF
            </Button>
          )}
          <Button onClick={sendWhatsApp} className="bg-[#25D366] hover:bg-[#1eb85a]">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Summary */}
        <Card>
          <CardHeader title={t('con.summary')} />
          <CardBody className="space-y-3 text-sm">
            <Line label={t('common.client')} value={c.client?.full_name ?? '—'} />
            <Line label={t('cli.cin')} value={c.client?.cin_passport ?? '—'} />
            <Line label={t('cli.phone')} value={c.client?.phone ?? '—'} />
            <Line
              label={t('common.vehicle')}
              value={c.vehicle ? `${c.vehicle.plate} · ${[c.vehicle.brand, c.vehicle.model].filter(Boolean).join(' ')}` : '—'}
            />
            {c.reservation && (
              <>
                <Line
                  label={t('common.dates')}
                  value={`${format(new Date(`${c.reservation.date_start}T00:00:00`), 'd MMM')} → ${format(
                    new Date(`${c.reservation.date_end}T00:00:00`),
                    'd MMM yyyy',
                  )}`}
                />
                <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-3">
                  <span className="text-[var(--color-muted)]">{t('res.total')}</span>
                  <span className="text-lg font-bold tnum text-[var(--color-brand)]">
                    {c.reservation.total_amount?.toLocaleString() ?? 0} MAD
                  </span>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* Condition + guarantee */}
        <Card className="lg:col-span-2">
          <CardHeader title={t('con.conditionGuarantee')} subtitle={t('con.conditionSub')} />
          <CardBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('con.mileageOutKm')}>
                <Input type="number" value={mileageOut} onChange={(e) => setMileageOut(e.target.value)} />
              </Field>
              <Field label={t('con.mileageInKm')}>
                <Input type="number" value={mileageIn} onChange={(e) => setMileageIn(e.target.value)} />
              </Field>
              <Field label={t('con.fuelOut')}>
                <Select value={fuelOut} onChange={(e) => setFuelOut(e.target.value)}>
                  <option value="">—</option>
                  {FUEL_LEVELS.map((f) => (
                    <option key={f} value={f}>
                      {t(FUEL_KEY[f])}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('con.fuelIn')}>
                <Select value={fuelIn} onChange={(e) => setFuelIn(e.target.value)}>
                  <option value="">—</option>
                  {FUEL_LEVELS.map((f) => (
                    <option key={f} value={f}>
                      {t(FUEL_KEY[f])}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="rounded-xl border border-[var(--color-line)] p-4">
              <div className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{t('con.guaranteeCheque')}</div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label={t('con.numberField')}>
                  <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
                </Field>
                <Field label={t('con.bank')}>
                  <Input value={checkBank} onChange={(e) => setCheckBank(e.target.value)} />
                </Field>
                <Field label={t('con.amount')}>
                  <Input type="number" value={checkAmount} onChange={(e) => setCheckAmount(e.target.value)} />
                </Field>
                <Field label={t('common.status')}>
                  <Select value={checkStatus} onChange={(e) => setCheckStatus(e.target.value)}>
                    {CHECK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(CHECK_KEY[s])}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            {/* Extras */}
            <div className="rounded-xl border border-[var(--color-line)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--color-ink)]">{t('con.extras')}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setExtras((x) => [...x, { name: '', price: 0 }])}
                >
                  <Plus className="h-3.5 w-3.5" /> {t('con.add')}
                </Button>
              </div>
              {extras.length === 0 && <p className="text-sm text-[var(--color-faint)]">{t('con.noExtras')}</p>}
              <div className="space-y-2">
                {extras.map((x, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder={t('con.extrasPlaceholder')}
                      value={x.name}
                      onChange={(e) =>
                        setExtras((arr) => arr.map((it, j) => (j === i ? { ...it, name: e.target.value } : it)))
                      }
                    />
                    <Input
                      type="number"
                      className="w-32"
                      placeholder="MAD"
                      value={x.price}
                      onChange={(e) =>
                        setExtras((arr) =>
                          arr.map((it, j) => (j === i ? { ...it, price: Number(e.target.value) || 0 } : it)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setExtras((arr) => arr.filter((_, j) => j !== i))}
                      className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-black/5"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] pt-4">
              <Button loading={saving} onClick={save}>
                {t('common.saveChanges')}
              </Button>
              {!closed && (
                <Button variant="secondary" onClick={close}>
                  <CheckCircle2 className="h-4 w-4" /> {t('con.closeRental')}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* PDF preview */}
      <Card className="mt-5">
        <CardHeader
          title={t('con.contractPdf')}
          subtitle={pdfUrl ? t('con.savedStorage') : t('con.generatePreview')}
          action={
            pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">
                  <Download className="h-4 w-4" /> {t('con.open')}
                </Button>
              </a>
            ) : (
              <Button size="sm" loading={generating} onClick={generate}>
                <FileText className="h-4 w-4" /> {t('con.generatePdf')}
              </Button>
            )
          }
        />
        <CardBody className="p-0">
          {pdfUrl ? (
            <iframe
              key={pdfUrl}
              src={`${pdfUrl}#toolbar=1&view=FitH`}
              title={t('con.contractPdf')}
              className="h-[75vh] w-full rounded-b-[var(--radius-card)] border-0 bg-[var(--color-surface-muted)]"
            />
          ) : (
            <div className="px-6 py-16">
              <EmptyState
                icon={FileText}
                title={t('con.noPdf')}
                description={t('con.noPdfDesc')}
                action={
                  <Button loading={generating} onClick={generate}>
                    <FileText className="h-4 w-4" /> {t('con.generatePdf')}
                  </Button>
                }
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-medium text-[var(--color-ink)]">{value}</span>
    </div>
  )
}
