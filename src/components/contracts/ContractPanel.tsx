import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { format } from 'date-fns'
import * as Dialog from '@radix-ui/react-dialog'
import {
  FileText,
  Download,
  MessageCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Eye,
  X,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  updateContract,
  generateContractPdf,
  previewContractPdf,
  closeContract,
  type ContractDetail,
  type Extra,
} from '~/server/contracts'
import { createSignatureLink } from '~/server/signatures'
import { FUEL_LEVELS, CHECK_STATUSES } from '~/lib/schemas'
import { resBadgeTone } from '~/lib/reservations'
import { waLink } from '~/lib/whatsapp'
import { useI18n } from '~/lib/i18n'
import { Button, Card, CardHeader, CardBody, Badge, Field, Input, Select, EmptyState } from '~/components/ui'

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

// The full contract editor, extracted from the old contracts.$contractId page so
// it can live inline on the reservation detail page. Takes an already-loaded
// ContractDetail; calls router.invalidate() to refresh the parent loader.
export function ContractPanel({ contract: c }: { contract: ContractDetail }) {
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
  const [form, setForm] = useState<Record<string, string>>(c.form ?? {})
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const hasPdf = c.has_pdf

  const setF = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  function downloadPdf() {
    if (!c.pdf_url) return
    const a = document.createElement('a')
    a.href = c.pdf_url
    a.download = ''
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
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
      form,
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
      await generateContractPdf({ data: { id: c.id } })
      toast.success(t('con.pdfGenerated'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('con.pdfGenFailed'))
    } finally {
      setGenerating(false)
    }
  }

  const [signLoading, setSignLoading] = useState(false)

  async function sendSignLink() {
    setSignLoading(true)
    try {
      const { path } = await createSignatureLink({ data: { contract_id: c.id } })
      const url = `${window.location.origin}${path}`
      await navigator.clipboard?.writeText(url).catch(() => {})
      const start = c.reservation ? format(new Date(`${c.reservation.date_start}T00:00:00`), 'dd/MM/yyyy') : ''
      const msg =
        `Bonjour ${c.client?.full_name ?? ''}, merci de signer votre contrat de location ${c.agency.name}` +
        `${start ? ` (à partir du ${start})` : ''} en ligne :\n${url}`
      window.open(waLink(c.client?.phone, msg), '_blank')
      toast.success(t('con.signLinkSent'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setSignLoading(false)
    }
  }

  async function preview() {
    setPreviewing(true)
    try {
      await updateContract({ data: payload() }) // persist current edits first
      const { dataUrl } = await previewContractPdf({ data: { id: c.id } })
      setPreviewUrl(dataUrl)
      setPreviewOpen(true)
    } catch (err: any) {
      toast.error(err?.message ?? t('con.pdfGenFailed'))
    } finally {
      setPreviewing(false)
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
    const link = c.pdf_url // permanent public URL, or null if not generated
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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-mono text-xl font-bold text-[var(--color-ink)]">#{c.short_id}</h2>
          {closed && <Badge tone="neutral">{t('con.closedBadge')}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.signed_at ? (
            <Badge tone="ok">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t('con.signed')}
            </Badge>
          ) : (
            <Button variant="secondary" loading={signLoading} onClick={sendSignLink}>
              <Pencil className="h-4 w-4" /> {t('con.signOnline')}
            </Button>
          )}
          <Button variant="secondary" loading={previewing} onClick={preview}>
            <Eye className="h-4 w-4" /> {t('con.preview')}
          </Button>
          <Button variant="secondary" loading={generating} onClick={generate}>
            <FileText className="h-4 w-4" /> {hasPdf ? t('con.regeneratePdf') : t('con.generatePdf')}
          </Button>
          {hasPdf && (
            <Button variant="secondary" onClick={downloadPdf}>
              <Download className="h-4 w-4" /> {t('con.downloadPdf')}
            </Button>
          )}
          <Button onClick={sendWhatsApp} className="bg-[#25D366] hover:bg-[#1eb85a]">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
        </div>
      </div>

      {/* Condition + guarantee */}
      <Card className="mt-5">
        <CardHeader title={bi('État & garantie', 'الحالة والضمان')} subtitle={t('con.conditionSub')} />
        <CardBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={bi('Km départ', 'الكيلومتراج عند الانطلاق')}>
              <Input type="number" value={mileageOut} onChange={(e) => setMileageOut(e.target.value)} />
            </Field>
            <Field label={bi('Km retour', 'الكيلومتراج عند الرجوع')}>
              <Input type="number" value={mileageIn} onChange={(e) => setMileageIn(e.target.value)} />
            </Field>
            <Field label={bi('Carburant départ', 'الوقود عند الانطلاق')}>
              <Select value={fuelOut} onChange={(e) => setFuelOut(e.target.value)}>
                <option value="">—</option>
                {FUEL_LEVELS.map((f) => (
                  <option key={f} value={f}>
                    {t(FUEL_KEY[f])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={bi('Carburant retour', 'الوقود عند الرجوع')}>
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
            <div className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{bi('Garantie (chèque)', 'الضمان (شيك)')}</div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label={bi('N° chèque', 'رقم الشيك')}>
                <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
              </Field>
              <Field label={bi('Banque', 'البنك')}>
                <Input value={checkBank} onChange={(e) => setCheckBank(e.target.value)} />
              </Field>
              <Field label={bi('Montant', 'المبلغ')}>
                <Input type="number" value={checkAmount} onChange={(e) => setCheckAmount(e.target.value)} />
              </Field>
              <Field label={bi('Statut', 'الحالة')}>
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
              <span className="text-sm font-semibold text-[var(--color-ink)]">{bi('Suppléments', 'الإضافات')}</span>
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

      {/* Printed-contract fields (fed into the PDF) */}
      <Card className="mt-5">
        <CardHeader title={bi('Détails du contrat (PDF)', 'تفاصيل العقد')} subtitle={t('con.pdfFieldsSub')} />
        <CardBody className="space-y-6">
          <FieldGroup title={bi('Détails du client', 'معلومات الزبون')}>
            {CLIENT_FIELDS.map(([k, fr, ar]) => (
              <Field key={k} label={bi(fr, ar)}>
                <Input value={form[k] ?? ''} onChange={(e) => setF(k, e.target.value)} />
              </Field>
            ))}
          </FieldGroup>

          <FieldGroup title={bi('Deuxième conducteur', 'السائق الثاني')}>
            {DRIVER2_FIELDS.map(([k, fr, ar]) => (
              <Field key={k} label={bi(fr, ar)}>
                <Input value={form[k] ?? ''} onChange={(e) => setF(k, e.target.value)} />
              </Field>
            ))}
          </FieldGroup>

          <FieldGroup title={bi('Heures de départ / retour', 'ساعات الانطلاق والرجوع')}>
            {TIME_FIELDS.map(([k, fr, ar]) => (
              <Field key={k} label={bi(fr, ar)}>
                <Input value={form[k] ?? ''} onChange={(e) => setF(k, e.target.value)} placeholder="12:00" />
              </Field>
            ))}
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-4">
            <Button loading={saving} onClick={save}>
              {t('common.saveChanges')}
            </Button>
            <Button variant="secondary" loading={previewing} onClick={preview}>
              <Eye className="h-4 w-4" /> {t('con.preview')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Contract PDF */}
      <Card className="mt-5">
        <CardHeader
          title={t('con.contractPdf')}
          subtitle={hasPdf ? t('con.savedStorage') : t('con.generatePreview')}
          action={
            hasPdf ? (
              <Button variant="secondary" size="sm" onClick={downloadPdf}>
                <Download className="h-4 w-4" /> {t('con.downloadPdf')}
              </Button>
            ) : (
              <Button size="sm" loading={generating} onClick={generate}>
                <FileText className="h-4 w-4" /> {t('con.generatePdf')}
              </Button>
            )
          }
        />
        <CardBody>
          {hasPdf ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">{t('con.contractPdf')}</p>
                  <p className="text-xs text-[var(--color-muted)]">{t('con.savedStorage')}</p>
                </div>
              </div>
              <Button variant="secondary" onClick={downloadPdf} className="w-full sm:w-auto">
                <Download className="h-4 w-4" /> {t('con.downloadPdf')}
              </Button>
            </div>
          ) : (
            <div className="px-2 py-10">
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

      {/* PDF preview modal */}
      <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="anim-pop fixed left-1/2 top-1/2 z-50 flex h-[90vh] w-[94vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3">
              <Dialog.Title className="text-sm font-bold text-[var(--color-ink)]">
                {t('con.preview')} — #{c.short_id}
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <Button size="sm" loading={generating} onClick={generate}>
                  <FileText className="h-4 w-4" /> {hasPdf ? t('con.regeneratePdf') : t('con.generatePdf')}
                </Button>
                <Dialog.Close className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-black/5">
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
            </div>
            <div className="flex-1 bg-[var(--color-surface-muted)]">
              {previewUrl ? (
                <iframe src={previewUrl} title="Contract preview" className="h-full w-full" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

// Field lists for the printed-contract form. Keys match ContractPDF's `form.*`.
// [key, French, Arabic] — both languages always shown on this page.
const CLIENT_FIELDS: [string, string, string][] = [
  ['client_prenom', 'Prénom', 'الإسم الشخصي'],
  ['client_cin_expiry', 'Expiration CIN', 'صلاحية البطاقة'],
  ['client_birthdate', 'Date de naissance', 'تاريخ الازدياد'],
  ['client_profession', 'Profession', 'المهنة'],
  ['client_permit_number', 'N° permis', 'رقم رخصة السياقة'],
  ['client_permit_date', 'Date permis', 'تاريخ الرخصة'],
  ['client_permit_place', 'Lieu délivrance permis', 'مكان التسليم'],
  ['client_phone2', 'Téléphone 2', 'الهاتف 2'],
  ['client_ville', 'Ville', 'المدينة'],
]
const DRIVER2_FIELDS: [string, string, string][] = [
  ['d2_nom', 'Nom', 'الإسم العائلي'],
  ['d2_prenom', 'Prénom', 'الإسم الشخصي'],
  ['d2_cin', 'CIN', 'البطاقة الوطنية'],
  ['d2_cin_expiry', 'Expiration CIN', 'صلاحية البطاقة'],
  ['d2_birthdate', 'Date de naissance', 'تاريخ الازدياد'],
  ['d2_profession', 'Profession', 'المهنة'],
  ['d2_permit_number', 'N° permis', 'رقم رخصة السياقة'],
  ['d2_permit_date', 'Date permis', 'تاريخ الرخصة'],
  ['d2_permit_place', 'Lieu délivrance permis', 'مكان التسليم'],
  ['d2_phone', 'Téléphone', 'الهاتف'],
  ['d2_address', 'Adresse', 'العنوان'],
  ['d2_ville', 'Ville', 'المدينة'],
]
const TIME_FIELDS: [string, string, string][] = [
  ['heure_depart', 'Heure départ', 'ساعة الانطلاق'],
  ['heure_retour', 'Heure retour', 'ساعة الرجوع'],
]

const bi = (fr: string, ar: string) => `${fr} · ${ar}`

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{title}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}
