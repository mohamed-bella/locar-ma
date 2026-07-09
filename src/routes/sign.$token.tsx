import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, ShieldCheck, Pencil, Trash2, Loader2, X } from 'lucide-react'
import { getSignatureRequest, submitSignature, type SignatureRequest } from '~/server/signatures'
import { SignaturePad, type SignaturePadHandle } from '~/components/SignaturePad'

export const Route = createFileRoute('/sign/$token')({
  loader: async ({ params }) => getSignatureRequest({ data: { token: params.token } }),
  component: SignPage,
})

function fdate(d: string | null) {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}
function money(n: number | null) {
  return n == null ? '—' : `${n.toLocaleString('fr-FR')} DH`
}

function SignPage() {
  const req = Route.useLoaderData() as SignatureRequest
  const { token } = Route.useParams()

  if (!req.ok) return <Invalid req={req} />
  return <SignForm req={req} token={token} />
}

function Shell({ req, children }: { req: SignatureRequest; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#eef2f7] px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 flex flex-col items-center text-center">
          {req.agency.logo_url ? (
            <img src={req.agency.logo_url} alt={req.agency.name} className="h-14 object-contain" />
          ) : (
            <div className="text-xl font-bold text-[#1d5b8d]">{req.agency.name}</div>
          )}
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-slate-400">Signature électronique sécurisée · توقيع إلكتروني آمن</p>
      </div>
    </div>
  )
}

function Invalid({ req }: { req: SignatureRequest }) {
  const map: Record<string, string> = {
    not_found: 'Ce lien de signature est invalide.',
    expired: 'Ce lien a expiré. Demandez-en un nouveau à votre agence.',
    already_signed: 'Ce contrat a déjà été signé. Merci !',
  }
  const already = req.reason === 'already_signed'
  return (
    <Shell req={req}>
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {already ? (
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        ) : (
          <X className="mx-auto h-14 w-14 text-slate-300" />
        )}
        <h1 className="mt-4 text-lg font-bold text-slate-800">
          {already ? 'Déjà signé' : 'Lien indisponible'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{map[req.reason ?? 'not_found']}</p>
      </div>
    </Shell>
  )
}

function SignForm({ req, token }: { req: SignatureRequest; token: string }) {
  const pad = useRef<SignaturePadHandle>(null)
  const [agreed, setAgreed] = useState(false)
  const [name, setName] = useState(req.contract.client_name ?? '')
  const [hasInk, setHasInk] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = agreed && hasInk && name.trim().length >= 2 && !submitting

  async function submit() {
    setError(null)
    const dataUrl = pad.current?.toDataURL()
    if (!dataUrl) {
      setError('Veuillez signer dans le cadre.')
      return
    }
    setSubmitting(true)
    try {
      await submitSignature({ data: { token, agreed: true, signer_name: name.trim(), signature: dataUrl } })
      setDone(true)
    } catch (e: any) {
      setError(e?.message ?? 'Échec de l’envoi. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <Shell req={req}>
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-800">Signature enregistrée</h1>
          <p className="mt-2 text-sm text-slate-500">
            Merci {name.trim()}. Votre contrat est signé.<br />
            <span className="text-slate-400">شكرا، تم توقيع العقد بنجاح.</span>
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell req={req}>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="bg-[#1d5b8d] px-6 py-5 text-white">
          <div className="text-xs font-medium uppercase tracking-wide text-white/70">
            Contrat de location · عقد الكراء
          </div>
          <div className="mt-0.5 font-mono text-lg font-bold">#{req.contract.short_id}</div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-px bg-slate-100 text-sm">
          <Cell label="Client · الزبون" value={req.contract.client_name ?? '—'} />
          <Cell label="Véhicule · السيارة" value={`${req.contract.vehicle ?? '—'}${req.contract.plate ? ` (${req.contract.plate})` : ''}`} />
          <Cell label="Du · من" value={fdate(req.contract.date_start)} />
          <Cell label="Au · إلى" value={fdate(req.contract.date_end)} />
          <div className="col-span-2 bg-white px-5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase text-slate-400">Total · المجموع</span>
              <span className="text-lg font-bold text-[#1d5b8d]">{money(req.contract.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div className="px-6 pt-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ShieldCheck className="h-4 w-4 text-[#1d5b8d]" /> Conditions · الشروط
          </div>
          <div className="max-h-44 overflow-y-auto whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-600">
            {req.terms}
          </div>
        </div>

        {/* Agree */}
        <label className="mx-6 mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#1d5b8d]"
          />
          <span className="text-slate-700">
            J'ai lu et j'accepte les conditions ci-dessus.
            <span className="mt-0.5 block text-slate-400">قرأت وأوافق على الشروط أعلاه.</span>
          </span>
        </label>

        {/* Name */}
        <div className="px-6 pt-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-500">Nom complet · الاسم الكامل</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Votre nom"
            className="h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm outline-none focus:border-[#1d5b8d] focus:ring-2 focus:ring-[#1d5b8d]/20"
          />
        </div>

        {/* Signature pad */}
        <div className="px-6 pb-6 pt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Pencil className="h-3.5 w-3.5" /> Signez ici · وقّع هنا
            </label>
            <button
              type="button"
              onClick={() => {
                pad.current?.clear()
                setHasInk(false)
              }}
              className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              <Trash2 className="h-3.5 w-3.5" /> Effacer
            </button>
          </div>
          <SignaturePad ref={pad} onChange={(empty) => setHasInk(!empty)} />

          {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#1d5b8d] py-3.5 text-base font-semibold text-white shadow-lg shadow-[#1d5b8d]/25 transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Envoi…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" /> Signer le contrat
              </>
            )}
          </button>
        </div>
      </div>
    </Shell>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-5 py-3">
      <div className="text-[10px] uppercase text-slate-400">{label}</div>
      <div className="mt-0.5 font-semibold text-slate-800">{value}</div>
    </div>
  )
}
