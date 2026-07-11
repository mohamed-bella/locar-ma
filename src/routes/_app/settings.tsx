import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Plus, Tag, Eye, EyeOff, Sparkles, Trash2, ImagePlus, Loader2, Building2, Table, Settings as SettingsIcon } from 'lucide-react'
import { toast } from 'sonner'
import { listAllBrands, hideBrand, unhideBrand } from '~/server/brands'
import {
  getAgencyProfile,
  presignAgencyLogo,
  updateAgencyLogo,
  presignAgencyStamp,
  updateAgencyStamp,
  updateAgencyProfile,
  type AgencyProfile,
} from '~/server/agency'
import { getSheetStatus, getGoogleAuthUrl, syncNow, disconnectSheet, backupContractsToDrive, type SheetStatus } from '~/server/sheets'
import { AddBrandDialog } from '~/components/AddBrandDialog'
import { Button, Card, CardHeader, CardBody, Badge, PageHeader, EmptyState, Modal, Field, Input, Select } from '~/components/ui'
import { listAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, type AlertRule } from '~/server/alertRules'
import { listDocumentTypes, createDocumentType, deleteDocumentType } from '~/server/documentTypes'
import { EXPIRY_FIELDS } from '~/lib/fleet'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n, LOCALES, LOCALE_LABELS, type Locale } from '~/lib/i18n'
import { Languages } from 'lucide-react'

export const Route = createFileRoute('/_app/settings')({
  loader: async () => {
    const [brands, alertRules, documentTypes, agency, sheet] = await Promise.all([
      listAllBrands(),
      listAlertRules(),
      listDocumentTypes(),
      getAgencyProfile(),
      getSheetStatus(),
    ])
    return { brands, alertRules, documentTypes, agency, sheet }
  },
  component: Settings,
})

function Settings() {
  const { brands, alertRules: rules, documentTypes, agency, sheet } = Route.useLoaderData()
  const router = useRouter()
  const { t, locale, setLocale } = useI18n()
  const [addOpen, setAddOpen] = useState(false)

  // Document types states
  const [newDocName, setNewDocName] = useState('')
  const [submittingDocType, setSubmittingDocType] = useState(false)

  // Rules states
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)
  const [submittingRule, setSubmittingRule] = useState(false)

  const [formField, setFormField] = useState<string>('insurance_expiry')
  const [formLabel, setFormLabel] = useState('')
  const [formDays, setFormDays] = useState('30')

  // Realtime Database Invalidations
  useRealtimeInvalidate('document_alert_rules')
  useRealtimeInvalidate('document_types')

  const BUILTIN_LABEL: Record<string, string> = {
    insurance_expiry: t('vd.insurance'),
    vignette_expiry: t('vd.vignette'),
    visite_tech_expiry: 'Visite technique',
  }
  const allDocTypes = [
    ...EXPIRY_FIELDS.map((f) => ({ code: f.key, name: BUILTIN_LABEL[f.key] ?? f.label })),
    ...documentTypes.map((dt) => ({ code: dt.code, name: dt.name })),
  ]

  async function toggle(brandId: string, hidden: boolean) {
    if (hidden) await unhideBrand({ data: { brand_id: brandId } })
    else await hideBrand({ data: { brand_id: brandId } })
    toast.success(hidden ? t('set.brandRestored') : t('set.brandHidden'))
    await router.invalidate()
  }

  async function handleAddDocType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!newDocName.trim()) return
    setSubmittingDocType(true)
    try {
      await createDocumentType({ data: { name: newDocName } })
      setNewDocName('')
      toast.success(t('set.docTypeCreated'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setSubmittingDocType(false)
    }
  }

  async function handleDeleteDocType(id: string) {
    if (!confirm(t('set.confirmDeleteDocType'))) return
    try {
      await deleteDocumentType({ data: { id } })
      toast.success(t('set.docTypeDeleted'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    }
  }

  function openAddRule() {
    setEditingRule(null)
    setFormField(allDocTypes[0]?.code ?? 'insurance_expiry')
    setFormLabel('')
    setFormDays('30')
    setModalOpen(true)
  }

  function openEditRule(rule: AlertRule) {
    setEditingRule(rule)
    setFormField(rule.field)
    setFormLabel(rule.label)
    setFormDays(String(rule.threshold_days))
    setModalOpen(true)
  }

  async function deleteRule(id: string) {
    if (!confirm(t('set.confirmDeleteRule'))) return
    try {
      await deleteAlertRule({ data: { id } })
      toast.success(t('set.ruleDeleted'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    }
  }

  async function handleSaveRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const days = parseInt(formDays, 10)
    if (days <= 0 || isNaN(days)) {
      toast.error(t('set.daysMustBePositive'))
      return
    }

    setSubmittingRule(true)
    try {
      if (editingRule) {
        await updateAlertRule({
          data: {
            id: editingRule.id,
            field: formField,
            label: formLabel.trim() || 'Warning Expiry',
            threshold_days: days,
          },
        })
        toast.success(t('set.ruleUpdated'))
      } else {
        await createAlertRule({
          data: {
            field: formField,
            label: formLabel.trim() || 'Warning Expiry',
            threshold_days: days,
          },
        })
        toast.success(t('set.ruleCreated'))
      }
      setModalOpen(false)
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setSubmittingRule(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('set.title')} subtitle={t('set.subtitle')} />

      {/* Account settings — name + WhatsApp notification number */}
      <AccountSettingsCard agency={agency} onDone={() => router.invalidate()} />

      {/* Agency logo */}
      <AgencyLogoCard agency={agency} onDone={() => router.invalidate()} />

      {/* Agency stamp / cachet */}
      <AgencyStampCard agency={agency} onDone={() => router.invalidate()} />

      {/* Google Sheets sync */}
      <SheetSyncCard status={sheet} canEdit={agency.canEdit} onDone={() => router.invalidate()} />

      {/* Language */}
      <Card className="mt-6">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-[var(--color-brand)]" /> {t('set.language')}
            </span>
          }
          subtitle={t('set.languageDesc')}
        />
        <CardBody>
          <div className="flex gap-2">
            {LOCALES.map((l: Locale) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  locale === l
                    ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                    : 'border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]'
                }`}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title={t('set.brands')}
          subtitle={t('set.brandsDesc')}
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-[18px] w-[18px]" /> {t('set.addBrand')}
            </Button>
          }
        />
        <CardBody>
          {brands.length === 0 ? (
            <EmptyState
              icon={Tag}
              title={t('set.noBrands')}
              description={t('set.noBrandsDesc')}
              action={
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="h-[18px] w-[18px]" /> {t('set.addBrand')}
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {brands.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center gap-3 rounded-xl border border-[var(--color-line)] p-3 ${
                    b.hidden ? 'bg-[var(--color-surface-muted)] opacity-70' : 'bg-white'
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-white">
                    {b.logo_url ? (
                      <img src={b.logo_url} alt="" className="h-full w-full object-contain p-1" />
                    ) : (
                      <Tag className="h-5 w-5 text-[var(--color-faint)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-[var(--color-ink)]">{b.name}</span>
                      {b.mine && (
                        <Badge tone="brand">
                          <Sparkles className="h-3 w-3" /> {t('set.yours')}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-[var(--color-faint)]">
                      {b.hidden ? t('set.hidden') : t('set.visible')}
                    </span>
                  </div>
                  <button
                    onClick={() => toggle(b.id, b.hidden)}
                    title={b.hidden ? t('set.show') : t('set.hideForAgency')}
                    className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-black/5"
                  >
                    {b.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Dynamic Document Types Management Card */}
      <Card className="mt-6">
        <CardHeader
          title={t('set.customDocTypes')}
          subtitle={t('set.customDocTypesDesc')}
        />
        <CardBody>
          <form onSubmit={handleAddDocType} className="flex gap-2 max-w-md mb-6">
            <Input
              name="newDocName"
              placeholder={t('set.docTypePlaceholder')}
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              required
            />
            <Button type="submit" loading={submittingDocType}>
              {t('set.createType')}
            </Button>
          </form>

          {documentTypes.length === 0 ? (
            <p className="py-2 text-sm text-[var(--color-muted)]">
              {t('set.noDocTypes')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {documentTypes.map((dt) => (
                <div
                  key={dt.id}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-[var(--color-ink)]">{dt.name}</span>
                  <span className="text-[10px] text-[var(--color-muted)] font-mono">({dt.code})</span>
                  <button
                    onClick={() => handleDeleteDocType(dt.id)}
                    className="ml-1 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                    title={`Delete ${dt.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Dynamic Expiry Alerts Management Card */}
      <Card className="mt-6">
        <CardHeader
          title={t('set.expiryAlerts')}
          subtitle={t('set.expiryAlertsDesc')}
          action={
            <Button onClick={openAddRule}>
              <Plus className="h-[18px] w-[18px]" /> {t('set.addRule')}
            </Button>
          }
        />
        <CardBody className="p-0">
          {rules.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
              {t('set.noRules')}
            </p>
          ) : (
            <ul>
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between border-b border-[var(--color-line)] last:border-0 px-5 py-4 gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--color-ink)]">{rule.label}</span>
                      <Badge tone="neutral" className="text-[10px] uppercase font-mono">
                        {allDocTypes.find((f) => f.code === rule.field)?.name ?? rule.field}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-muted)]">
                      {t('set.ruleTrigger', { n: rule.threshold_days })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEditRule(rule)}>
                      {t('common.edit')}
                    </Button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="rounded-lg p-2 text-[var(--color-danger)] hover:bg-red-50 transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <AddBrandDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => router.invalidate()} />

      {/* Edit Alert Rule Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingRule ? t('set.editRule') : t('set.addRuleTitle')}
        description={t('set.ruleModalDesc')}
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          <Field label={t('set.documentType')} required>
            <Select name="field" value={formField} onChange={(e) => setFormField(e.target.value)} required>
              {allDocTypes.map((dt) => (
                <option key={dt.code} value={dt.code}>
                  {dt.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('set.alertName')} required>
            <Input
              name="label"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              placeholder={t('set.alertNamePlaceholder')}
              required
            />
          </Field>

          <Field label={t('set.triggerDays')} required>
            <Input
              name="thresholdDays"
              type="number"
              min="1"
              max="365"
              value={formDays}
              onChange={(e) => setFormDays(e.target.value)}
              required
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-[var(--color-line)] pt-4 mt-6">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={submittingRule}>
              {editingRule ? t('common.saveChanges') : t('set.createRule')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024

function SheetSyncCard({ status, canEdit, onDone }: { status: SheetStatus; canEdit: boolean; onDone: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState<null | 'connect' | 'sync' | 'disconnect' | 'backup'>(null)

  // Surface the OAuth callback result (Google redirects back with ?sheet=...).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const s = p.get('sheet')
    if (!s) return
    if (s === 'connected') toast.success(t('set.sheetEnabled'))
    else if (s === 'error') toast.error(`Google connection failed: ${p.get('reason') ?? 'unknown'}`)
    window.history.replaceState({}, '', window.location.pathname)
    onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connect() {
    setBusy('connect')
    try {
      const { url } = await getGoogleAuthUrl()
      window.location.href = url // leaves the app; no need to clear busy
    } catch (e: any) {
      toast.error(e?.message ?? t('common.actionFailed'))
      setBusy(null)
    }
  }

  async function sync() {
    setBusy('sync')
    try {
      const { rows } = await syncNow()
      toast.success(`Synced ${rows} rows to Google Sheets`)
      onDone()
    } catch (e: any) {
      toast.error(e?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(null)
    }
  }

  async function backup() {
    setBusy('backup')
    try {
      const { uploaded, failed } = await backupContractsToDrive()
      if (failed > 0) toast.warning(t('set.backupPartial', { n: uploaded, f: failed }))
      else toast.success(t('set.backupDone', { n: uploaded }))
      onDone()
    } catch (e: any) {
      toast.error(e?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    setBusy('disconnect')
    try {
      await disconnectSheet()
      toast.success(t('set.sheetDisabled'))
      onDone()
    } catch (e: any) {
      toast.error(e?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Table className="h-[18px] w-[18px]" /> {t('set.sheetTitle')}
          </span>
        }
      />
      <CardBody>
        {!status.configured ? (
          <p className="text-sm text-[var(--color-muted)]">{t('set.sheetNotConfigured')}</p>
        ) : (
          <div>
            {status.connected ? (
              <div className="rounded-xl border border-[var(--color-line)] p-4 bg-emerald-50/10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      <span className="h-2 w-2 rounded-full bg-emerald-500 -ml-4" />
                      {t('set.sheetOn')}
                    </div>
                    {status.googleEmail && (
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        Connected as <strong className="text-[var(--color-ink)]">{status.googleEmail}</strong>
                      </p>
                    )}
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      {status.lastSyncedAt
                        ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
                        : 'Not synced yet'}
                    </p>
                    {status.url && (
                      <a
                        href={status.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-brand)] hover:underline"
                      >
                        {t('set.sheetOpen')}
                        <svg className="h-3.5 w-3.5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3" />
                        </svg>
                      </a>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <Button loading={busy === 'sync'} disabled={!!busy} onClick={sync}>
                        Sync now
                      </Button>
                      <Button variant="secondary" loading={busy === 'backup'} disabled={!!busy} onClick={backup}>
                        {t('set.backupContracts')}
                      </Button>
                      <Button variant="secondary" loading={busy === 'disconnect'} disabled={!!busy} onClick={disconnect}>
                        {t('set.sheetDisable')}
                      </Button>
                    </div>
                  )}
                </div>
                {(status.contractsFolderUrl || status.contractsBackedUpAt) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
                    {status.contractsBackedUpAt && (
                      <span>{t('set.lastBackup', { date: new Date(status.contractsBackedUpAt).toLocaleString() })}</span>
                    )}
                    {status.contractsFolderUrl && (
                      <a
                        href={status.contractsFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[var(--color-brand)] hover:underline"
                      >
                        {t('set.openContractsFolder')}
                      </a>
                    )}
                  </div>
                )}
                {status.lastSyncError && (
                  <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 break-words">
                    Last sync error: {status.lastSyncError}
                  </p>
                )}
                {status.contractsBackupError && (
                  <p className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 break-words">
                    Backup error: {status.contractsBackupError}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--color-line)] p-5 bg-white">
                <p className="text-sm text-[var(--color-muted)] leading-relaxed max-w-xl">
                  Connect your Google account and the app creates a private spreadsheet in
                  your Drive, then mirrors your cars, reservations, contracts, clients,
                  payments and services into it — refreshed hourly and on demand. Client ID
                  numbers, emails and addresses are never exported.
                </p>
                {canEdit && (
                  <Button className="mt-4 font-semibold" loading={busy === 'connect'} disabled={!!busy} onClick={connect}>
                    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 11v2h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.6-2.5C17.4 2.8 15 1.8 12 1.8 6.9 1.8 2.8 6 2.8 11S6.9 20.2 12 20.2c5.9 0 9.8-4.1 9.8-9.9 0-.7-.1-1.2-.2-1.7H12z" />
                    </svg>
                    Connect Google account
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function AccountSettingsCard({ agency, onDone }: { agency: AgencyProfile; onDone: () => void }) {
  const { t } = useI18n()
  const canEdit = agency.canEdit
  const [busy, setBusy] = useState(false)

  // Single form state for the whole account card.
  const initial = {
    name: agency.name,
    whatsapp_number: agency.whatsapp_number ?? '',
    legal_name: agency.legal_name ?? '',
    address: agency.address ?? '',
    ice: agency.ice ?? '',
    rc: agency.rc ?? '',
    patente: agency.patente ?? '',
    rib: agency.rib ?? '',
    company_phone: agency.company_phone ?? '',
  }
  const [f, setF] = useState(initial)
  const set = (k: keyof typeof initial, v: string) => setF((p) => ({ ...p, [k]: v }))
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => f[k].trim() !== initial[k])

  // WhatsApp on/off — saved immediately on toggle (independent of the form).
  const [waEnabled, setWaEnabled] = useState(agency.whatsapp_enabled)
  const [waBusy, setWaBusy] = useState(false)
  async function toggleWhatsApp(next: boolean) {
    setWaEnabled(next)
    setWaBusy(true)
    try {
      await updateAgencyProfile({ data: { name: f.name.trim() || agency.name, whatsapp_enabled: next } })
      toast.success(next ? t('set.waOn') : t('set.waOff'))
      onDone()
    } catch (err: any) {
      setWaEnabled(!next) // revert on failure
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setWaBusy(false)
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!f.name.trim()) {
      toast.error(t('common.actionFailed'))
      return
    }
    setBusy(true)
    try {
      await updateAgencyProfile({
        data: {
          name: f.name.trim(),
          whatsapp_number: f.whatsapp_number.trim() || null,
          legal_name: f.legal_name.trim() || null,
          address: f.address.trim() || null,
          ice: f.ice.trim() || null,
          rc: f.rc.trim() || null,
          patente: f.patente.trim() || null,
          rib: f.rib.trim() || null,
          company_phone: f.company_phone.trim() || null,
        },
      })
      toast.success(t('common.saveChanges'))
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-[var(--color-brand)]" /> {t('set.account')}
          </span>
        }
        subtitle={t('set.accountDesc')}
      />
      <CardBody>
        <form onSubmit={save} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('set.agencyName')} required>
              <Input value={f.name} onChange={(e) => set('name', e.target.value)} disabled={!canEdit || busy} required />
            </Field>
            <Field label={t('set.whatsappNumber')}>
              <Input
                type="tel"
                value={f.whatsapp_number}
                onChange={(e) => set('whatsapp_number', e.target.value)}
                placeholder="06 12 34 56 78"
                disabled={!canEdit || busy}
              />
            </Field>
          </div>
          <p className="-mt-3 text-xs text-[var(--color-muted)]">{t('set.whatsappHint')}</p>

          {/* WhatsApp notifications on/off — saves instantly */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--color-line)] px-4 py-3">
            <div className="min-w-0 pr-4">
              <div className="text-sm font-semibold text-[var(--color-ink)]">{t('set.waToggle')}</div>
              <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                {waEnabled ? t('set.waToggleOnDesc') : t('set.waToggleOffDesc')}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={waEnabled}
              disabled={!canEdit || waBusy}
              onClick={() => toggleWhatsApp(!waEnabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                waEnabled ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-line-strong)]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  waEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div>
            <div className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{t('set.companyLegal')}</div>
            <p className="mb-4 text-xs text-[var(--color-muted)]">{t('set.companyLegalDesc')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('set.legalName')}>
                <Input value={f.legal_name} onChange={(e) => set('legal_name', e.target.value)} placeholder="KAWTAR'S PARC SARL" disabled={!canEdit || busy} />
              </Field>
              <Field label={t('set.companyPhone')}>
                <Input value={f.company_phone} onChange={(e) => set('company_phone', e.target.value)} placeholder="06 58 37 39 37" disabled={!canEdit || busy} />
              </Field>
              <Field label={t('set.address')} className="sm:col-span-2">
                <Input value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Rés El Bahja Imm 5 Magasin 5 cym, RABAT" disabled={!canEdit || busy} />
              </Field>
              <Field label="ICE">
                <Input value={f.ice} onChange={(e) => set('ice', e.target.value)} disabled={!canEdit || busy} />
              </Field>
              <Field label="RC">
                <Input value={f.rc} onChange={(e) => set('rc', e.target.value)} disabled={!canEdit || busy} />
              </Field>
              <Field label={t('set.patente')}>
                <Input value={f.patente} onChange={(e) => set('patente', e.target.value)} disabled={!canEdit || busy} />
              </Field>
              <Field label="RIB">
                <Input value={f.rib} onChange={(e) => set('rib', e.target.value)} disabled={!canEdit || busy} />
              </Field>
            </div>
          </div>

          {canEdit ? (
            <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
              <Button type="submit" loading={busy} disabled={!dirty}>
                {t('common.saveChanges')}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">{t('set.logoOwnerOnly')}</p>
          )}
        </form>
      </CardBody>
    </Card>
  )
}

function AgencyLogoCard({ agency, onDone }: { agency: AgencyProfile; onDone: () => void }) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const canEdit = agency.canEdit

  async function onFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('img.uploadFailed'))
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t('set.logoTooBig'))
      return
    }
    setBusy(true)
    try {
      const signed = await presignAgencyLogo({ data: { name: file.name, type: file.type, size: file.size } })
      const put = await fetch(signed.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      await updateAgencyLogo({ data: { logo_url: signed.publicUrl } })
      toast.success(t('set.logoUpdated'))
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? t('img.uploadFailed'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removeLogo() {
    setBusy(true)
    try {
      await updateAgencyLogo({ data: { logo_url: null } })
      toast.success(t('set.logoRemoved'))
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[var(--color-brand)]" /> {t('set.logo')}
          </span>
        }
        subtitle={t('set.logoDesc')}
      />
      <CardBody>
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
            {agency.logo_url ? (
              <img src={agency.logo_url} alt={agency.name} className="h-full w-full object-contain p-2" />
            ) : (
              <Building2 className="h-9 w-9 text-[var(--color-faint)]" />
            )}
          </div>

          <div className="min-w-0">
            {canEdit ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-[18px] w-[18px]" />
                    )}
                    {agency.logo_url ? t('set.changeLogo') : t('set.uploadLogo')}
                  </Button>
                  {agency.logo_url && (
                    <Button variant="ghost" onClick={removeLogo} disabled={busy}>
                      <Trash2 className="h-4 w-4" /> {t('set.removeLogo')}
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-[var(--color-muted)]">{t('set.logoHint')}</p>
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">{t('set.logoOwnerOnly')}</p>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onFile(e.target.files)}
        />
      </CardBody>
    </Card>
  )
}

function AgencyStampCard({ agency, onDone }: { agency: AgencyProfile; onDone: () => void }) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const canEdit = agency.canEdit

  async function onFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('img.uploadFailed'))
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t('set.logoTooBig'))
      return
    }
    setBusy(true)
    try {
      const signed = await presignAgencyStamp({ data: { name: file.name, type: file.type, size: file.size } })
      const put = await fetch(signed.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      await updateAgencyStamp({ data: { stamp_url: signed.publicUrl } })
      toast.success(t('set.stampUpdated'))
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? t('img.uploadFailed'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removeStamp() {
    setBusy(true)
    try {
      await updateAgencyStamp({ data: { stamp_url: null } })
      toast.success(t('set.stampRemoved'))
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-[var(--color-brand)]" /> {t('set.stamp')}
          </span>
        }
        subtitle={t('set.stampDesc')}
      />
      <CardBody>
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--color-line)] bg-white">
            {agency.stamp_url ? (
              <img src={agency.stamp_url} alt="" className="h-full w-full object-contain p-2" />
            ) : (
              <ImagePlus className="h-9 w-9 text-[var(--color-faint)]" />
            )}
          </div>

          <div className="min-w-0">
            {canEdit ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-[18px] w-[18px]" />
                    )}
                    {agency.stamp_url ? t('set.changeStamp') : t('set.uploadStamp')}
                  </Button>
                  {agency.stamp_url && (
                    <Button variant="ghost" onClick={removeStamp} disabled={busy}>
                      <Trash2 className="h-4 w-4" /> {t('set.removeStamp')}
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-[var(--color-muted)]">{t('set.stampHint')}</p>
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">{t('set.logoOwnerOnly')}</p>
            )}
          </div>
        </div>

        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />
      </CardBody>
    </Card>
  )
}
