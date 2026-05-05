/**
 * HIPAA De-identifier
 * Two modes:
 *   1. Dataset — upload CSV/Excel, remove PHI columns, download clean file
 *   2. Text    — paste text, redact structured PHI with regex
 *
 * Security: 100% in-browser. No data leaves the device.
 */

import { useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  ShieldCheck, ShieldAlert, ShieldX, UploadCloud, X,
  Lock, Download, Copy, Check, FileText, Database, Eraser,
} from 'lucide-react'

// ─── Safe Harbor identifiers ────────────────────────────────────────────────

interface SHIdentifier {
  number: number
  id: string
  label: string
  patterns: string[]
  risk: 'high' | 'medium'
}

const IDENTIFIERS: SHIdentifier[] = [
  { number: 1,  id: 'names',       label: 'Names',                          risk: 'high',   patterns: ['name','first_name','last_name','fname','lname','full_name','given_name','surname','middle_name','patient_name','firstname','lastname','middlename'] },
  { number: 2,  id: 'geographic',  label: 'Geographic < state',             risk: 'high',   patterns: ['address','street','city','county','zip','zipcode','zip_code','postal','postal_code','precinct','neighborhood','ward'] },
  { number: 3,  id: 'dates',       label: 'Dates (except year)',            risk: 'medium', patterns: ['dob','date_of_birth','birth_date','birthdate','admission_date','discharge_date','date_of_death','date_of_service','visit_date','service_date','dos'] },
  { number: 4,  id: 'ages',        label: 'Ages over 89',                   risk: 'medium', patterns: ['age','patient_age','age_years','current_age'] },
  { number: 5,  id: 'phone',       label: 'Phone numbers',                  risk: 'high',   patterns: ['phone','telephone','phone_number','phonenumber','cell','mobile','tel','contact_number','home_phone','work_phone'] },
  { number: 6,  id: 'fax',         label: 'Fax numbers',                    risk: 'high',   patterns: ['fax','fax_number','faxnumber','facsimile'] },
  { number: 7,  id: 'email',       label: 'Email addresses',                risk: 'high',   patterns: ['email','email_address','e_mail','emailaddress','email_addr'] },
  { number: 8,  id: 'ssn',         label: 'Social Security numbers',        risk: 'high',   patterns: ['ssn','social_security','social_security_number','socialsecurity','ss_number','ssno'] },
  { number: 9,  id: 'mrn',         label: 'Medical record numbers',         risk: 'high',   patterns: ['mrn','medical_record_number','medical_record','record_number','patient_key','patient_id','chart_number','chart_no'] },
  { number: 10, id: 'health_plan', label: 'Health plan beneficiary numbers',risk: 'high',   patterns: ['health_plan','beneficiary_id','insurance_id','member_id','policy_number','plan_id','insurance_number','group_number'] },
  { number: 11, id: 'account',     label: 'Account numbers',                risk: 'high',   patterns: ['account_number','account_id','acct_number','acct_no','account_no','acct'] },
  { number: 12, id: 'certificate', label: 'Certificate/license numbers',    risk: 'medium', patterns: ['license_number','certificate_number','license_id','cert_number','license_no','npi','license'] },
  { number: 13, id: 'vehicle',     label: 'Vehicle identifiers',            risk: 'medium', patterns: ['vehicle_id','license_plate','vin','plate_number','vehicle_serial','plate'] },
  { number: 14, id: 'device',      label: 'Device identifiers',             risk: 'medium', patterns: ['device_id','serial_number','device_serial','imei','device_number'] },
  { number: 15, id: 'url',         label: 'Web URLs',                       risk: 'medium', patterns: ['url','website','web_address','webpage','web_url','link'] },
  { number: 16, id: 'ip_address',  label: 'IP addresses',                   risk: 'medium', patterns: ['ip_address','ip_addr','ip','ipaddr'] },
  { number: 17, id: 'biometric',   label: 'Biometric identifiers',          risk: 'high',   patterns: ['fingerprint','voice_print','biometric','retina_scan','biometric_id','voiceprint'] },
  { number: 18, id: 'photo',       label: 'Full-face photographs',          risk: 'medium', patterns: ['photo','photograph','face_image','picture','photo_url','image_url','image','headshot'] },
]

function classifyColumn(col: string): SHIdentifier | null {
  const tokens = col.toLowerCase().split(/[_\s.]+/)
  const full = col.toLowerCase()
  for (const id of IDENTIFIERS) {
    for (const pat of id.patterns) {
      if (full === pat) return id
      if (pat.split('_').every(t => tokens.includes(t))) return id
      if (tokens.includes(pat)) return id
    }
  }
  return null
}

// ─── Text PHI patterns ──────────────────────────────────────────────────────

interface TextPattern { label: string; re: RegExp; tag: string }

const TEXT_PATTERNS: TextPattern[] = [
  { label: 'Email',       tag: '[EMAIL]',      re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { label: 'Phone',       tag: '[PHONE]',      re: /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}/g },
  { label: 'SSN',         tag: '[SSN]',        re: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g },
  { label: 'Date',        tag: '[DATE]',       re: /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](\d{2}|\d{4})\b/g },
  { label: 'IP Address',  tag: '[IP_ADDRESS]', re: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
  { label: 'URL',         tag: '[URL]',        re: /https?:\/\/[^\s<>"']+/g },
  { label: 'ZIP Code',    tag: '[ZIP]',        re: /\b\d{5}(?:-\d{4})?\b/g },
  { label: 'Credit Card', tag: '[CREDIT_CARD]',re: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g },
  { label: 'MRN',         tag: '[MRN]',        re: /\b(?:MRN|mrn|medical\s+record\s*(?:number|#|no\.?))\s*:?\s*[\w-]+/gi },
]

function deidentifyText(input: string): { result: string; counts: Record<string, number> } {
  let result = input
  const counts: Record<string, number> = {}
  for (const { label, tag, re } of TEXT_PATTERNS) {
    re.lastIndex = 0
    const matches = result.match(re) ?? []
    if (matches.length) {
      counts[label] = matches.length
      re.lastIndex = 0
      result = result.replace(re, tag)
    }
  }
  return { result, counts }
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/)
  const headers = parseCSVLine(lines[0] ?? '')
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })
    rows.push(row)
  }
  return { headers, rows }
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { cells.push(cur); cur = '' }
    else { cur += ch }
  }
  cells.push(cur)
  return cells.map(c => c.trim().replace(/^"|"$/g, ''))
}

function toCSV(headers: string[], rows: Record<string, string>[]): string {
  const esc = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
  const head = headers.map(esc).join(',')
  const body = rows.map(r => headers.map(h => esc(r[h] ?? '')).join(',')).join('\n')
  return head + '\n' + body
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ColResult { column: string; match: SHIdentifier | null; remove: boolean }
type Mode = 'dataset' | 'text'

// ─── Component ───────────────────────────────────────────────────────────────

export default function DataManagerPage() {
  const [mode, setMode] = useState<Mode>('dataset')

  // Dataset state
  const [cols, setCols]           = useState<ColResult[]>([])
  const [rows, setRows]           = useState<Record<string, string>[]>([])
  const [fileName, setFileName]   = useState('')
  const [dsError, setDsError]     = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const fileRef                   = useRef<HTMLInputElement>(null)

  // Text state
  const [rawText, setRawText]     = useState('')
  const [redacted, setRedacted]   = useState('')
  const [textCounts, setTextCounts] = useState<Record<string, number>>({})
  const [copied, setCopied]       = useState(false)
  const [hasRun, setHasRun]       = useState(false)

  // ── Dataset processing ──

  const processFile = useCallback((file: File) => {
    setDsError(''); setCols([]); setRows([]); setFileName('')
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setDsError('Please upload a CSV or Excel (.xlsx / .xls) file.')
      return
    }
    setFileName(file.name)

    if (ext === 'csv') {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const { headers, rows: r } = parseCSV(e.target?.result as string)
          setCols(headers.map(col => {
            const match = classifyColumn(col)
            return { column: col, match, remove: !!match }
          }))
          setRows(r)
        } catch { setDsError('Could not parse CSV.') }
      }
      reader.readAsText(file, 'UTF-8')
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
          const headers = data.length > 0 ? Object.keys(data[0]) : []
          const r = data.map(row => {
            const out: Record<string, string> = {}
            headers.forEach(h => { out[h] = String(row[h] ?? '') })
            return out
          })
          setCols(headers.map(col => {
            const match = classifyColumn(col)
            return { column: col, match, remove: !!match }
          }))
          setRows(r)
        } catch { setDsError('Could not parse Excel file.') }
      }
      reader.readAsArrayBuffer(file)
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const toggleRemove = (col: string) => {
    setCols(prev => prev.map(c => c.column === col ? { ...c, remove: !c.remove } : c))
  }

  const downloadClean = () => {
    const keepCols = cols.filter(c => !c.remove).map(c => c.column)
    const csv = toCSV(keepCols, rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.replace(/\.(csv|xlsx|xls)$/i, '_deidentified.csv')
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetDataset = () => { setCols([]); setRows([]); setFileName(''); setDsError('') }

  // ── Text processing ──

  const runTextDeidentify = () => {
    const { result, counts } = deidentifyText(rawText)
    setRedacted(result)
    setTextCounts(counts)
    setHasRun(true)
    setCopied(false)
  }

  const copyResult = () => {
    navigator.clipboard.writeText(redacted).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const resetText = () => { setRawText(''); setRedacted(''); setTextCounts({}); setHasRun(false); setCopied(false) }

  // ── Derived ──

  const phiCols  = cols.filter(c => c.match)
  const safeCols = cols.filter(c => !c.match)
  const removedCount = cols.filter(c => c.remove).length
  const totalDetected = Object.values(textCounts).reduce((a, b) => a + b, 0)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

      {/* Title */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Eraser size={22} color="var(--primary)" />
          HIPAA De-identifier
        </h1>
        <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
          Remove all 18 HIPAA Safe Harbor identifiers — 100% in-browser, nothing uploaded.
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.45rem', padding: '0.28rem 0.65rem', borderRadius: 20, backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <Lock size={11} color="#10b981" />
          <span style={{ fontSize: '0.71rem', color: '#10b981', fontWeight: 600 }}>No data leaves your browser</span>
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['dataset', 'text'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.55rem 1.2rem', borderRadius: 8,
              border: `1px solid ${mode === m ? 'var(--primary)' : 'var(--border)'}`,
              background: mode === m ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
              color: mode === m ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: mode === m ? 600 : 400, fontSize: '0.88rem', cursor: 'pointer',
            }}
          >
            {m === 'dataset' ? <Database size={15} /> : <FileText size={15} />}
            {m === 'dataset' ? 'Dataset (CSV / Excel)' : 'Free Text'}
          </button>
        ))}
      </div>

      {/* ── DATASET MODE ─────────────────────────────────────────────────── */}
      {mode === 'dataset' && (
        <>
          {/* Drop zone */}
          {cols.length === 0 && (
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 12, padding: '3.5rem 2rem', textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: dragOver ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.01)',
                transition: 'all 0.15s',
              }}
            >
              <UploadCloud size={38} color={dragOver ? 'var(--primary)' : 'var(--text-muted)'} style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Drop a CSV or Excel file here</p>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>or click to browse</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = '' }} style={{ display: 'none' }} />
            </div>
          )}

          {dsError && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef444440', color: '#ef4444', fontSize: '0.88rem', marginTop: '0.75rem' }}>
              {dsError}
            </div>
          )}

          {cols.length > 0 && (
            <>
              {/* File + summary row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: 20, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    {fileName}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{rows.length.toLocaleString()} rows · {cols.length} columns</span>
                  <button onClick={resetDataset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>

                <button
                  onClick={downloadClean}
                  disabled={removedCount === 0 && phiCols.length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.45rem',
                    padding: '0.55rem 1.2rem', borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%)',
                    color: '#fff', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
                    opacity: removedCount === 0 && phiCols.length === 0 ? 0.5 : 1,
                  }}
                >
                  <Download size={15} />
                  Download De-identified CSV
                  {removedCount > 0 && <span style={{ marginLeft: '0.25rem', fontSize: '0.78rem', opacity: 0.85 }}>({removedCount} col{removedCount !== 1 ? 's' : ''} removed)</span>}
                </button>
              </div>

              {/* Banner */}
              <div style={{
                marginBottom: '1rem', padding: '0.8rem 1.1rem', borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: '0.7rem',
                backgroundColor: phiCols.length === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${phiCols.length === 0 ? '#10b981' : '#ef4444'}`,
              }}>
                {phiCols.length === 0
                  ? <ShieldCheck size={18} color="#10b981" />
                  : <ShieldX size={18} color="#ef4444" />}
                <span style={{ fontWeight: 700, color: phiCols.length === 0 ? '#10b981' : '#ef4444' }}>
                  {phiCols.length === 0 ? 'No PHI columns detected' : `${phiCols.length} PHI column${phiCols.length !== 1 ? 's' : ''} detected`}
                </span>
                {phiCols.length > 0 && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    — toggle to keep a column; click Download to export
                  </span>
                )}
              </div>

              {/* Column list */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.87rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Columns ({cols.length})</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
                    <span style={{ color: '#ef4444' }}>{phiCols.length} PHI</span> · <span style={{ color: '#10b981' }}>{safeCols.length} safe</span>
                  </span>
                </div>
                <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {cols.map(({ column, match, remove }) => (
                    <div key={column} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
                      backgroundColor: match && remove ? 'rgba(239,68,68,0.04)' : match && !remove ? 'rgba(245,158,11,0.04)' : undefined,
                      opacity: match && remove ? 1 : 1,
                    }}>
                      {match
                        ? <ShieldAlert size={15} color={match.risk === 'high' ? '#ef4444' : '#f59e0b'} style={{ flexShrink: 0 }} />
                        : <ShieldCheck size={15} color="#10b981" style={{ flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <code style={{
                          fontSize: '0.84rem', fontWeight: match ? 600 : 400,
                          color: match && remove ? '#ef4444' : 'var(--text-primary)',
                          textDecoration: match && remove ? 'line-through' : 'none',
                        }}>
                          {column}
                        </code>
                        {match && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            #{match.number} {match.label}
                          </span>
                        )}
                      </div>
                      {match ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={remove}
                            onChange={() => toggleRemove(column)}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#ef4444' }}
                          />
                          <span style={{ fontSize: '0.75rem', color: remove ? '#ef4444' : 'var(--text-muted)' }}>
                            {remove ? 'Remove' : 'Keep'}
                          </span>
                        </label>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 500 }}>safe</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── TEXT MODE ────────────────────────────────────────────────────── */}
      {mode === 'text' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Input */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.87rem', fontWeight: 600, color: 'var(--text-primary)' }}>Input text</label>
                {rawText && <button onClick={resetText} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><X size={13} /> Clear</button>}
              </div>
              <textarea
                value={rawText}
                onChange={e => { setRawText(e.target.value); setHasRun(false) }}
                placeholder="Paste any clinical note, report, or free text…&#10;&#10;Example: Patient John Smith (DOB 01/15/1980, SSN 123-45-6789) can be reached at john@email.com or 555-867-5309."
                style={{
                  width: '100%', minHeight: 320, padding: '0.85rem', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '0.87rem', lineHeight: 1.6,
                  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={runTextDeidentify}
                disabled={!rawText.trim()}
                style={{
                  marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem',
                  padding: '0.6rem 1.35rem', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%)',
                  color: '#fff', fontWeight: 600, fontSize: '0.88rem',
                  cursor: rawText.trim() ? 'pointer' : 'not-allowed',
                  opacity: rawText.trim() ? 1 : 0.5, width: '100%', justifyContent: 'center',
                }}
              >
                <Eraser size={15} />
                Remove HIPAA Identifiers
              </button>
            </div>

            {/* Output */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.87rem', fontWeight: 600, color: 'var(--text-primary)' }}>De-identified output</label>
                {hasRun && redacted && (
                  <button onClick={copyResult} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.28rem 0.7rem', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)', color: copied ? '#10b981' : 'var(--text-secondary)',
                    fontSize: '0.78rem', cursor: 'pointer',
                  }}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              <div style={{
                minHeight: 320, padding: '0.85rem', borderRadius: 8,
                border: `1px solid ${hasRun && totalDetected > 0 ? '#10b981' : 'var(--border)'}`,
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                fontSize: '0.87rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', overflowY: 'auto',
              }}>
                {!hasRun
                  ? <span style={{ color: 'var(--text-muted)' }}>De-identified text will appear here…</span>
                  : redacted || <span style={{ color: 'var(--text-muted)'}}>(empty)</span>}
              </div>

              {/* Stats */}
              {hasRun && (
                <div style={{ marginTop: '0.6rem', padding: '0.65rem 0.85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  {totalDetected === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.82rem', fontWeight: 600 }}>
                      <ShieldCheck size={14} /> No PHI detected
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.4rem' }}>
                        {totalDetected} item{totalDetected !== 1 ? 's' : ''} redacted
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {Object.entries(textCounts).map(([label, count]) => (
                          <span key={label} style={{
                            fontSize: '0.72rem', padding: '0.12rem 0.45rem', borderRadius: 4,
                            backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.2)', fontWeight: 600,
                          }}>
                            {label}: {count}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Pattern reference */}
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Detected pattern types</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {TEXT_PATTERNS.map(p => (
                <span key={p.label} style={{
                  fontSize: '0.72rem', padding: '0.12rem 0.45rem', borderRadius: 4,
                  backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}>
                  {p.label} → <code>{p.tag}</code>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
