/**
 * HIPAA Safe Harbor Column Checker
 *
 * Security model:
 *  - Files are parsed entirely in the browser using FileReader / xlsx.
 *  - No data is sent to any server, API, or third-party service.
 *  - No cookies, localStorage, or sessionStorage are written.
 *  - No analytics, no tracking.
 *  - The Content-Security-Policy header (set in vite.config.ts) blocks
 *    any inadvertent outbound requests.
 */

import { useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronRight, UploadCloud, X, Lock } from 'lucide-react'

// ─── Safe Harbor identifier definitions ────────────────────────────────────

interface SafeHarborIdentifier {
  number: number
  id: string
  label: string
  description: string
  patterns: string[]
  risk: 'high' | 'medium'
}

const SAFE_HARBOR_IDENTIFIERS: SafeHarborIdentifier[] = [
  { number: 1,  id: 'names',        label: 'Names',                             description: 'All full or partial names',                                                           patterns: ['name','first_name','last_name','fname','lname','full_name','given_name','surname','middle_name','patient_name','firstname','lastname','middlename'],        risk: 'high'   },
  { number: 2,  id: 'geographic',   label: 'Geographic subdivisions < state',   description: 'Street, city, county, precinct, ZIP (except first 3 digits if pop > 20,000)',         patterns: ['address','street','city','county','zip','zipcode','zip_code','postal','postal_code','precinct','neighborhood','ward'],                                   risk: 'high'   },
  { number: 3,  id: 'dates',        label: 'Dates (except year)',                description: 'Birth, admission, discharge, death, service dates — all elements except year',       patterns: ['dob','date_of_birth','birth_date','birthdate','admission_date','discharge_date','date_of_death','date_of_service','visit_date','service_date','dos'],       risk: 'medium' },
  { number: 4,  id: 'ages_over_89', label: 'Ages over 89',                       description: 'Ages > 89 must be aggregated into "90 or older"',                                    patterns: ['age','patient_age','age_years','current_age'],                                                                                                            risk: 'medium' },
  { number: 5,  id: 'phone',        label: 'Telephone numbers',                  description: 'All telephone numbers',                                                               patterns: ['phone','telephone','phone_number','phonenumber','cell','mobile','tel','contact_number','home_phone','work_phone'],                                         risk: 'high'   },
  { number: 6,  id: 'fax',          label: 'Fax numbers',                        description: 'All fax numbers',                                                                     patterns: ['fax','fax_number','faxnumber','facsimile'],                                                                                                                risk: 'high'   },
  { number: 7,  id: 'email',        label: 'Email addresses',                    description: 'All email addresses',                                                                 patterns: ['email','email_address','e_mail','emailaddress','email_addr'],                                                                                              risk: 'high'   },
  { number: 8,  id: 'ssn',          label: 'Social Security numbers',            description: 'All Social Security Numbers',                                                         patterns: ['ssn','social_security','social_security_number','socialsecurity','ss_number','ssno'],                                                                       risk: 'high'   },
  { number: 9,  id: 'mrn',          label: 'Medical record numbers',             description: 'All MRNs and patient record identifiers',                                             patterns: ['mrn','medical_record_number','medical_record','record_number','patient_key','patient_id','chart_number','chart_no'],                                       risk: 'high'   },
  { number: 10, id: 'health_plan',  label: 'Health plan beneficiary numbers',    description: 'Insurance IDs, member IDs, policy numbers',                                          patterns: ['health_plan','beneficiary_id','insurance_id','member_id','policy_number','plan_id','insurance_number','group_number'],                                     risk: 'high'   },
  { number: 11, id: 'account',      label: 'Account numbers',                    description: 'All account numbers',                                                                 patterns: ['account_number','account_id','acct_number','acct_no','account_no','acct'],                                                                                  risk: 'high'   },
  { number: 12, id: 'certificate',  label: 'Certificate/license numbers',        description: 'License and certificate numbers',                                                     patterns: ['license_number','certificate_number','license_id','cert_number','license_no','npi','license'],                                                             risk: 'medium' },
  { number: 13, id: 'vehicle',      label: 'Vehicle identifiers',                description: 'Vehicle IDs, license plates, VINs',                                                  patterns: ['vehicle_id','license_plate','vin','plate_number','vehicle_serial','plate'],                                                                                 risk: 'medium' },
  { number: 14, id: 'device',       label: 'Device identifiers',                 description: 'Device IDs and serial numbers',                                                       patterns: ['device_id','serial_number','device_serial','imei','device_number'],                                                                                        risk: 'medium' },
  { number: 15, id: 'url',          label: 'Web URLs',                           description: 'All web universal resource locators',                                                 patterns: ['url','website','web_address','webpage','web_url','link'],                                                                                                  risk: 'medium' },
  { number: 16, id: 'ip_address',   label: 'IP addresses',                       description: 'All Internet Protocol addresses',                                                     patterns: ['ip_address','ip_addr','ip','ipaddr'],                                                                                                                      risk: 'medium' },
  { number: 17, id: 'biometric',    label: 'Biometric identifiers',              description: 'Finger prints, voice prints, retina scans',                                          patterns: ['fingerprint','voice_print','biometric','retina_scan','biometric_id','voiceprint'],                                                                         risk: 'high'   },
  { number: 18, id: 'photo',        label: 'Full-face photographs',              description: 'Full-face photos and comparable identifying images',                                  patterns: ['photo','photograph','face_image','picture','photo_url','image_url','image','headshot'],                                                                    risk: 'medium' },
]

// ─── Column classifier ──────────────────────────────────────────────────────

function classifyColumn(col: string): SafeHarborIdentifier | null {
  const tokens = col.toLowerCase().split(/[_\s\-\.]+/)
  const full = col.toLowerCase()
  for (const id of SAFE_HARBOR_IDENTIFIERS) {
    for (const pat of id.patterns) {
      const patTokens = pat.split('_')
      if (full === pat) return id
      if (patTokens.every(t => tokens.includes(t))) return id
      if (tokens.includes(pat)) return id
    }
  }
  return null
}

interface ColResult { column: string; match: SafeHarborIdentifier | null }

// ─── In-browser file parsers ────────────────────────────────────────────────
// No data leaves the browser. Only the header row is read; row data is never
// loaded into memory.

function parseCSVHeaders(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const headers: string[] = []
  let cur = ''
  let inQ = false
  for (const ch of firstLine) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { headers.push(cur.trim().replace(/^"|"$/g, '')); cur = '' }
    else { cur += ch }
  }
  headers.push(cur.trim().replace(/^"|"$/g, ''))
  return headers.filter(Boolean)
}

function parseExcelHeaders(buf: ArrayBuffer): string[] {
  const wb = XLSX.read(buf, { type: 'array', sheetRows: 1 }) // read ONLY first row
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws['!ref']) return []
  const range = XLSX.utils.decode_range(ws['!ref'])
  const headers: string[] = []
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) headers.push(String(cell.v))
  }
  return headers.filter(Boolean)
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DataManagerPage() {
  const [columns, setColumns]                   = useState<ColResult[]>([])
  const [fileName, setFileName]                 = useState<string>('')
  const [dragOver, setDragOver]                 = useState(false)
  const [error, setError]                       = useState<string>('')
  const [expanded, setExpanded]                 = useState<Set<number>>(new Set())
  const inputRef                                = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    setError('')
    setColumns([])
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const allowed = ['csv', 'xlsx', 'xls']
    if (!allowed.includes(ext)) {
      setError('Please upload a CSV or Excel (.xlsx / .xls) file.')
      return
    }
    setFileName(file.name)

    if (ext === 'csv') {
      // Read only the first 4 KB — enough for any header row, never loads PHI rows
      const slice = file.slice(0, 4096)
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const text = e.target?.result as string
          const headers = parseCSVHeaders(text)
          setColumns(headers.map(col => ({ column: col, match: classifyColumn(col) })))
        } catch {
          setError('Could not read CSV headers.')
        }
      }
      reader.readAsText(slice, 'UTF-8')
    } else {
      // Excel: read entire file but xlsx only parses row 1 (sheetRows: 1)
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const headers = parseExcelHeaders(e.target?.result as ArrayBuffer)
          setColumns(headers.map(col => ({ column: col, match: classifyColumn(col) })))
        } catch {
          setError('Could not read Excel headers.')
        }
      }
      reader.readAsArrayBuffer(file)
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const reset = () => { setColumns([]); setFileName(''); setError('') }
  const toggle = (n: number) => setExpanded(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })

  const phiCols    = columns.filter(c => c.match)
  const safeCols   = columns.filter(c => !c.match)
  const presentIds = new Set(phiCols.map(c => c.match!.number))
  const compliant  = phiCols.length === 0

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldCheck size={22} color="var(--primary)" />
          HIPAA Safe Harbor Checker
        </h1>
        <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Checks column headers against all 18 Safe Harbor identifiers (45 CFR §164.514(b)).
        </p>

        {/* Privacy notice */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', padding: '0.3rem 0.65rem', borderRadius: 20, backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <Lock size={11} color="#10b981" />
          <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
            100% in-browser — no file data is ever uploaded or transmitted
          </span>
        </div>
      </div>

      {/* Drop zone */}
      {columns.length === 0 && (
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '3.5rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: dragOver ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.15s',
            marginBottom: '1rem',
          }}
        >
          <UploadCloud size={36} color={dragOver ? 'var(--primary)' : 'var(--text-muted)'} style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>
            Drop a CSV or Excel file here
          </p>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            or click to browse — only column headers are read, never row data
          </p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onInputChange} style={{ display: 'none' }} />
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef444440', color: '#ef4444', fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {columns.length > 0 && (
        <>
          {/* File badge + reset */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: 20, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {fileName}
            </span>
            <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} title="Check a different file">
              <X size={14} />
            </button>
          </div>

          {/* Compliance banner */}
          <div style={{
            marginBottom: '1rem', padding: '0.8rem 1.1rem', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: '0.7rem',
            backgroundColor: compliant ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${compliant ? '#10b981' : '#ef4444'}`,
          }}>
            {compliant ? <ShieldCheck size={18} color="#10b981" /> : <ShieldX size={18} color="#ef4444" />}
            <div>
              <span style={{ fontWeight: 700, color: compliant ? '#10b981' : '#ef4444' }}>
                {compliant ? 'Safe Harbor Compliant' : `${phiCols.length} PHI field${phiCols.length !== 1 ? 's' : ''} detected`}
              </span>
              <span style={{ color: 'var(--text-secondary)', marginLeft: '0.75rem', fontSize: '0.82rem' }}>
                {columns.length} columns · {safeCols.length} safe · {phiCols.length} PHI
                {!compliant && ` · ${presentIds.size} of 18 identifier categories present`}
              </span>
            </div>
          </div>

          {/* Two-panel layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1rem', alignItems: 'start' }}>

            {/* Left: column list */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                Columns ({columns.length})
              </div>
              <div style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                {columns.map(({ column, match }) => (
                  <div key={column} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                    padding: '0.65rem 1rem',
                    borderBottom: '1px solid var(--border)',
                    backgroundColor: match ? 'rgba(239,68,68,0.03)' : undefined,
                  }}>
                    {match
                      ? <ShieldAlert size={15} color={match.risk === 'high' ? '#ef4444' : '#f59e0b'} style={{ marginTop: 2, flexShrink: 0 }} />
                      : <ShieldCheck size={15} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <code style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: match ? 600 : 400 }}>
                        {column}
                      </code>
                      {match ? (
                        <div style={{ marginTop: '0.2rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.4rem', borderRadius: 3,
                            backgroundColor: match.risk === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                            color: match.risk === 'high' ? '#ef4444' : '#f59e0b',
                            border: `1px solid ${match.risk === 'high' ? '#ef444440' : '#f59e0b40'}`,
                          }}>
                            {match.risk.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                            #{match.number} — {match.label}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 500 }}>safe</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: 18-identifier checklist */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: '5rem' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                18 Safe Harbor Identifiers
              </div>
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {SAFE_HARBOR_IDENTIFIERS.map(id => {
                  const present = presentIds.has(id.number)
                  const matchingCols = phiCols.filter(c => c.match?.number === id.number)
                  const isOpen = expanded.has(id.number)
                  return (
                    <div key={id.number} style={{ borderBottom: '1px solid var(--border)' }}>
                      <button
                        onClick={() => present && toggle(id.number)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.55rem 1rem', background: 'none', border: 'none',
                          cursor: present ? 'pointer' : 'default', textAlign: 'left',
                          backgroundColor: present ? 'rgba(239,68,68,0.04)' : undefined,
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%', display: 'flex', flexShrink: 0,
                          alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 700,
                          backgroundColor: present ? (id.risk === 'high' ? '#ef4444' : '#f59e0b') : 'rgba(16,185,129,0.18)',
                          color: present ? '#fff' : '#10b981',
                        }}>
                          {id.number}
                        </span>
                        <span style={{ flex: 1, fontSize: '0.79rem', color: present ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: present ? 600 : 400 }}>
                          {id.label}
                        </span>
                        {present ? (
                          <>
                            <span style={{ fontSize: '0.68rem', color: id.risk === 'high' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                              {matchingCols.length}
                            </span>
                            {isOpen ? <ChevronDown size={11} color="var(--text-muted)" /> : <ChevronRight size={11} color="var(--text-muted)" />}
                          </>
                        ) : (
                          <span style={{ fontSize: '0.68rem', color: '#10b981' }}>clear</span>
                        )}
                      </button>
                      {present && isOpen && (
                        <div style={{ padding: '0.35rem 1rem 0.55rem 3rem', backgroundColor: 'rgba(239,68,68,0.04)' }}>
                          <p style={{ margin: '0 0 0.35rem', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{id.description}</p>
                          {matchingCols.map(({ column }) => (
                            <code key={column} style={{
                              display: 'inline-block', fontSize: '0.73rem', padding: '0.1rem 0.35rem',
                              marginRight: '0.3rem', marginBottom: '0.2rem', borderRadius: 3,
                              backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444',
                              border: '1px solid rgba(239,68,68,0.2)',
                            }}>
                              {column}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: '0.65rem 1rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>{presentIds.size} present</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{18 - presentIds.size} clear</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(presentIds.size / 18) * 100}%`, backgroundColor: '#ef4444', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                <p style={{ margin: '0.45rem 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {compliant
                    ? 'All 18 identifiers absent. Dataset may qualify for sharing under Safe Harbor.'
                    : 'Remove or de-identify flagged columns before sharing under Safe Harbor.'}
                </p>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  )
}
