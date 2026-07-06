import { useRef, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Plus, Tag, Eye, EyeOff, Sparkles, Trash2, ImagePlus, Loader2, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { listAllBrands, hideBrand, unhideBrand } from '~/server/brands'
import { getAgencyProfile, presignAgencyLogo, updateAgencyLogo, type AgencyProfile } from '~/server/agency'
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
    const [brands, alertRules, documentTypes, agency] = await Promise.all([
      listAllBrands(),
      listAlertRules(),
      listDocumentTypes(),
      getAgencyProfile(),
    ])
    return { brands, alertRules, documentTypes, agency }
  },
  component: Settings,
})

function Settings() {
  const { brands, alertRules: rules, documentTypes, agency } = Route.useLoaderData()
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

      {/* Agency logo */}
      <AgencyLogoCard agency={agency} onDone={() => router.invalidate()} />

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
