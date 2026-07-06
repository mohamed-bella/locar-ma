import { createSign } from 'node:crypto'

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

console.log('Using Service Account Email:', email)
console.log('Key is present:', !!key)

if (!email || !key) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY is missing in env!')
  process.exit(1)
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessToken(scopes) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: email,
    scope: scopes,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  try {
    const signer = createSign('RSA-SHA256')
    signer.update(`${header}.${claims}`)
    signer.end()
    const jwt = `${header}.${claims}.${b64url(signer.sign(key))}`
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    })
    if (!res.ok) {
      console.error(`  Token exchange failed for scopes [${scopes}]. Status: ${res.status}`)
      console.error(await res.text())
      return null
    }
    const j = await res.json()
    return j.access_token
  } catch (err) {
    console.error(`  Error generating token for scopes [${scopes}]:`, err)
    return null
  }
}

async function testWithScopes(scopes) {
  console.log(`\n--- Testing scopes: "${scopes}" ---`)
  const token = await getAccessToken(scopes)
  if (!token) {
    console.log('Skipping due to token failure.')
    return
  }
  
  const title = `Locar Test Sheet — ${Date.now()}`
  console.log(`Attempting to create spreadsheet: "${title}"...`)
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 
      authorization: `Bearer ${token}`, 
      'content-type': 'application/json' 
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Cars', index: 0 } }],
    }),
  })
  console.log('Response Status:', res.status)
  const text = await res.text()
  console.log('Response Body:', text)
}

async function run() {
  console.log('\n--- Testing Drive API list files ---')
  const token = await getAccessToken('https://www.googleapis.com/auth/drive.readonly')
  if (token) {
    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        headers: { authorization: `Bearer ${token}` }
      })
      console.log('Drive API Status:', res.status)
      console.log('Drive API Response:', await res.text())
    } catch (e) {
      console.error('Drive API request failed:', e)
    }
  }

  console.log('\n--- Testing Sheets API GET mock sheet ---')
  const sheetsToken = await getAccessToken('https://www.googleapis.com/auth/spreadsheets.readonly')
  if (sheetsToken) {
    try {
      const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets/123', {
        headers: { authorization: `Bearer ${sheetsToken}` }
      })
      console.log('Sheets API GET Status:', res.status)
      console.log('Sheets API GET Response:', await res.text())
    } catch (e) {
      console.error('Sheets API GET request failed:', e)
    }
  }

  console.log('\n--- Testing Drive API create file ---')
  const driveWriteToken = await getAccessToken('https://www.googleapis.com/auth/drive')
  if (driveWriteToken) {
    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 
          authorization: `Bearer ${driveWriteToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Locar Test File.txt',
          mimeType: 'text/plain'
        })
      })
      console.log('Drive API Create Status:', res.status)
      console.log('Drive API Create Response:', await res.text())
    } catch (e) {
      console.error('Drive API Create request failed:', e)
    }

    try {
      console.log('\n--- Testing Drive API create spreadsheet ---')
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 
          authorization: `Bearer ${driveWriteToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Locar Drive-Created Sheet',
          mimeType: 'application/vnd.google-apps.spreadsheet'
        })
      })
      console.log('Drive API Create Sheet Status:', res.status)
      console.log('Drive API Create Sheet Response:', await res.text())
    } catch (e) {
      console.error('Drive API Create Sheet request failed:', e)
    }
  }

  await testWithScopes('https://www.googleapis.com/auth/spreadsheets')
  await testWithScopes('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file')
  await testWithScopes('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive')
}

run()
