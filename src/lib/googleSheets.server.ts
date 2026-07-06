import { createSign } from 'node:crypto'
import { serverEnv } from './env.server'

// Minimal Google service-account client (no googleapis dep — keeps the
// serverless bundle small). Signs an RS256 JWT with node:crypto, exchanges it
// for an access token, and calls the Sheets + Drive REST APIs directly.
//
// Used by the provisioning server functions. The webhook sync endpoint
// (api/sheet-sync.mjs) carries its own self-contained copy so it stays a plain
// isolated Vercel function.

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

let cached: { token: string; exp: number } | null = null

export function sheetsConfigured(): boolean {
  const env = serverEnv()
  return !!(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY)
}

async function getAccessToken(): Promise<string> {
  const env = serverEnv()
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account not configured')
  }
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token

  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: SCOPES,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  signer.end()
  const signature = b64url(signer.sign(privateKey))
  const jwt = `${header}.${claims}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) throw new Error(`Google token error: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cached = { token: json.access_token, exp: now + json.expires_in }
  return json.access_token
}

export type ProvisionResult = {
  spreadsheetId: string
  spreadsheetUrl: string
  tabs: Record<string, number> // tab title → sheetId (gid)
}

// Create a spreadsheet with the given blank tabs. Header rows are written lazily
// by the sync endpoint on first write, so schema lives in exactly one place.
export async function createSpreadsheet(title: string, tabTitles: string[]): Promise<ProvisionResult> {
  const token = await getAccessToken()
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      properties: { title },
      sheets: tabTitles.map((t, i) => ({ properties: { title: t, index: i } })),
    }),
  })
  if (!res.ok) throw new Error(`Sheets create error: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as {
    spreadsheetId: string
    spreadsheetUrl: string
    sheets: { properties: { title: string; sheetId: number } }[]
  }
  const tabs: Record<string, number> = {}
  for (const s of json.sheets) tabs[s.properties.title] = s.properties.sheetId
  return { spreadsheetId: json.spreadsheetId, spreadsheetUrl: json.spreadsheetUrl, tabs }
}

// Share the created file with a human (the agency owner) as an editor.
export async function shareFile(fileId: string, email: string, role: 'writer' | 'reader' = 'reader'): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ role, type: 'user', emailAddress: email }),
    },
  )
  if (!res.ok) throw new Error(`Drive share error: ${res.status} ${await res.text()}`)
}

export function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : input.trim()
}

// Connects to an existing spreadsheet and ensures that the required tabs exist.
// This allows bypassing service account storage quota limits by using a spreadsheet owned by a human.
export async function linkExistingSpreadsheet(
  spreadsheetIdOrUrl: string,
  tabTitles: string[]
): Promise<ProvisionResult> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl)
  const token = await getAccessToken()

  const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
  
  if (!getRes.ok) {
    if (getRes.status === 403 || getRes.status === 404) {
      throw new Error(
        `Permissions Denied: The service account cannot access this spreadsheet. Please ensure you shared it with the service account email as "Editor" (with no domain restrictions) and try again.`
      )
    }
    throw new Error(`Google Sheets access error: ${getRes.status} ${await getRes.text()}`)
  }

  const details = (await getRes.json()) as {
    spreadsheetId: string
    spreadsheetUrl: string
    sheets: { properties: { title: string; sheetId: number } }[]
  }

  const existingMap: Record<string, number> = {}
  for (const s of details.sheets) {
    existingMap[s.properties.title] = s.properties.sheetId
  }

  // Identify missing tabs and create them
  const missingTabs = tabTitles.filter((t) => existingMap[t] === undefined)
  if (missingTabs.length > 0) {
    const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requests: missingTabs.map((t) => ({
          addSheet: { properties: { title: t } },
        })),
      }),
    })

    if (!batchRes.ok) {
      throw new Error(`Failed to create missing tabs: ${batchRes.status} ${await batchRes.text()}`)
    }

    const batchJson = (await batchRes.json()) as {
      replies: { addSheet: { properties: { title: string; sheetId: number } } }[]
    }

    for (const reply of batchJson.replies || []) {
      const s = reply.addSheet.properties
      existingMap[s.title] = s.sheetId
    }
  }

  return {
    spreadsheetId: details.spreadsheetId,
    spreadsheetUrl: details.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${details.spreadsheetId}`,
    tabs: existingMap,
  }
}

