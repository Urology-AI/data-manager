import { useState, useEffect } from 'react'
import { datasetsApi } from '../api/client'
import { ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronRight, FileSearch } from 'lucide-react'

// ─── HIPAA Safe Harbor: 18 identifier definitions ──────────────────────────

interface SafeHarborIdentifier {
  number: number
  id: string
  label: string
  description: string
  patterns: string[]
  risk: 'high' | 'medium'
}

const SAFE_HARBOR_IDENTIFIERS: SafeHarborIdentifier[] = [
  { number: 1, id: 'names', label: 'Names', description: 'All full or partial names', patterns: ['name', 'first_name', 'last_name', 'fname', 'lname', 'full_name', 'given_name', 'surname', 'middle_name', 'patient_name', 'firstname', 'lastname'], risk: 'high' },
  { number: 2, id: 'geographic', label: 'Geographic subdivisions < state', description: 'Street, city, county, precinct, ZIP code (except first 3 digits if population > 20,000)', patterns: ['address', 'street', 'city', 'county', 'zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'precinct', 'neighborhood'], risk: 'high' },
  { number: 3, id: 'dates', label: 'Dates (except year)', description: 'Birth, admission, discharge, death, service dates — all elements except year', patterns: ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'admission_date', 'discharge_date', 'date_of_death', 'date_of_service', 'visit_date', 'service_date', 'date', 'dos'], risk: 'medium' },
  { number: 4, id: 'ages_over_89', label: 'Ages over 89', description: 'Ages > 89 must be grouped as "90 or older"', patterns: ['age', 'patient_age', 'age_years', 'current_age'], risk: 'medium' },
  { number: 5, id: 'phone', label: 'Telephone numbers', description: 'All telephone numbers', patterns: ['phone', 'telephone', 'phone_number', 'phonenumber', 'cell', 'mobile', 'tel', 'contact_number', 'home_phone', 'work_phone'], risk: 'high' },
  { number: 6, id: 'fax', label: 'Fax numbers', description: 'All fax numbers', patterns: ['fax', 'fax_number', 'faxnumber', 'facsimile'], risk: 'high' },
  { number: 7, id: 'email', label: 'Email addresses', description: 'All email addresses', patterns: ['email', 'email_address', 'e_mail', 'emailaddress', 'email_addr'], risk: 'high' },
  { number: 8, id: 'ssn', label: 'Social Security numbers', description: 'All Social Security Numbers', patterns: ['ssn', 'social_security', 'social_security_number', 'socialsecurity', 'ss_number', 'ssno'], risk: 'high' },
  { number: 9, id: 'mrn', label: 'Medical record numbers', description: 'All MRNs and patient record IDs', patterns: ['mrn', 'medical_record_number', 'medical_record', 'record_number', 'patient_key', 'patient_id', 'chart_number', 'chart_no'], risk: 'high' },
  { number: 10, id: 'health_plan', label: 'Health plan beneficiary numbers', description: 'Insurance IDs, member IDs, policy numbers', patterns: ['health_plan', 'beneficiary_id', 'insurance_id', 'member_id', 'policy_number', 'plan_id', 'insurance_number', 'group_number'], risk: 'high' },
  { number: 11, id: 'account', label: 'Account numbers', description: 'All account numbers', patterns: ['account_number', 'account_id', 'acct_number', 'acct_no', 'account_no', 'acct'], risk: 'high' },
  { number: 12, id: 'certificate', label: 'Certificate/license numbers', description: 'License and certificate numbers', patterns: ['license_number', 'certificate_number', 'license_id', 'cert_number', 'license_no', 'npi', 'license'], risk: 'medium' },
  { number: 13, id: 'vehicle', label: 'Vehicle identifiers', description: 'Vehicle IDs, license plates, VINs', patterns: ['vehicle_id', 'license_plate', 'vin', 'plate_number', 'vehicle_serial', 'plate'], risk: 'medium' },
  { number: 14, id: 'device', label: 'Device identifiers', description: 'Device IDs and serial numbers', patterns: ['device_id', 'serial_number', 'device_serial', 'imei', 'device_number'], risk: 'medium' },
  { number: 15, id: 'url', label: 'Web URLs', description: 'All web universal resource locators', patterns: ['url', 'website', 'web_address', 'webpage', 'web_url', 'link'], risk: 'medium' },
  { number: 16, id: 'ip_address', label: 'IP addresses', description: 'All Internet Protocol addresses', patterns: ['ip_address', 'ip_addr', 'ip', 'ipaddr'], risk: 'medium' },
  { number: 17, id: 'biometric', label: 'Biometric identifiers', description: 'Finger prints, voice prints, retina scans', patterns: ['fingerprint', 'voice_print', 'biometric', 'retina_scan', 'biometric_id', 'voiceprint'], risk: 'high' },
  { number: 18, id: 'photo', label: 'Full-face photographs', description: 'Full-face photos and comparable identifying images', patterns: ['photo', 'photograph', 'face_image', 'picture', 'photo_url', 'image_url', 'image', 'headshot'], risk: 'medium' },
]

// ─── Classification logic ───────────────────────────────────────────────────

function classifyColumn(columnName: string): SafeHarborIdentifier | null {
  const tokens = columnName.toLowerCase().split(/[_\s\-\.]+/)
  const full = columnName.toLowerCase()

  for (const identifier of SAFE_HARBOR_IDENTIFIERS) {
    for (const pattern of identifier.patterns) {
      const patternTokens = pattern.split('_')
      // Exact full match
      if (full === pattern) return identifier
      // All tokens of the pattern appear in the column tokens
      if (patternTokens.every(t => tokens.includes(t))) return identifier
      // Column tokens are a subset of pattern (e.g. column "dob" in pattern "dob")
      if (tokens.includes(pattern)) return identifier
    }
  }
  return null
}

interface ColumnResult {
  column: string
  match: SafeHarborIdentifier | null
}

// ─── Component ─────────────────────────────────────────────────────────────

interface Dataset {
  id: string
  name: string
  source_filename: string
  created_at: string
}

export default function DataManagerPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [columns, setColumns] = useState<ColumnResult[]>([])
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [expandedIdentifiers, setExpandedIdentifiers] = useState<Set<number>>(new Set())

  useEffect(() => {
    datasetsApi.list().then((data: any) => {
      const list: Dataset[] = Array.isArray(data) ? data : data.datasets ?? []
      setDatasets(list)
      if (list.length > 0) setSelectedId(list[0].id)
    }).catch(console.error).finally(() => setLoadingDatasets(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoadingColumns(true)
    setColumns([])
    datasetsApi.getColumns(selectedId).then((data: any) => {
      const cols: string[] = data.columns ?? []
      setColumns(cols.map(col => ({ column: col, match: classifyColumn(col) })))
    }).catch(console.error).finally(() => setLoadingColumns(false))
  }, [selectedId])

  const phiColumns = columns.filter(c => c.match !== null)
  const safeColumns = columns.filter(c => c.match === null)
  const presentIdentifierNumbers = new Set(phiColumns.map(c => c.match!.number))
  const isCompliant = phiColumns.length === 0

  const toggleIdentifier = (num: number) => {
    setExpandedIdentifiers(prev => {
      const next = new Set(prev)
      next.has(num) ? next.delete(num) : next.add(num)
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldCheck size={24} color="var(--primary)" />
          HIPAA Safe Harbor Checker
        </h1>
        <p style={{ margin: '0.4rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Checks dataset columns against the 18 Safe Harbor identifiers (45 CFR §164.514(b))
        </p>
      </div>

      {/* Dataset selector */}
      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-primary)', fontWeight: 500 }}>
          <FileSearch size={16} color="var(--text-secondary)" />
          Dataset
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{
              flex: 1, maxWidth: 400, padding: '0.45rem 0.75rem',
              backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.9rem',
            }}
          >
            {loadingDatasets
              ? <option>Loading datasets…</option>
              : datasets.length === 0
              ? <option>No datasets found — upload a file first</option>
              : datasets.map(d => <option key={d.id} value={d.id}>{d.name || d.source_filename}</option>)
            }
          </select>
        </label>
      </div>

      {/* Compliance banner */}
      {columns.length > 0 && (
        <div style={{
          marginBottom: '1rem', padding: '0.85rem 1.25rem',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: '0.75rem',
          backgroundColor: isCompliant ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${isCompliant ? '#10b981' : '#ef4444'}`,
        }}>
          {isCompliant
            ? <ShieldCheck size={20} color="#10b981" />
            : <ShieldX size={20} color="#ef4444" />
          }
          <div>
            <span style={{ fontWeight: 600, color: isCompliant ? '#10b981' : '#ef4444' }}>
              {isCompliant ? 'Safe Harbor Compliant' : `${phiColumns.length} PHI field${phiColumns.length !== 1 ? 's' : ''} detected`}
            </span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: '0.75rem', fontSize: '0.85rem' }}>
              {columns.length} total columns · {safeColumns.length} safe · {phiColumns.length} PHI
              {!isCompliant && ` · ${presentIdentifierNumbers.size} of 18 identifier categories present`}
            </span>
          </div>
        </div>
      )}

      {loadingColumns ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <div className="loading" style={{ margin: '0 auto 1rem' }} />
          Scanning columns…
        </div>
      ) : columns.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1rem', alignItems: 'start' }}>

          {/* Left: Column list */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Columns ({columns.length})
            </div>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {columns.map(({ column, match }) => (
                <div key={column} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.7rem 1rem',
                  borderBottom: '1px solid var(--border)',
                  backgroundColor: match ? 'rgba(239,68,68,0.04)' : undefined,
                }}>
                  {match
                    ? <ShieldAlert size={16} color={match.risk === 'high' ? '#ef4444' : '#f59e0b'} style={{ marginTop: 2, flexShrink: 0 }} />
                    : <ShieldCheck size={16} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: match ? 600 : 400 }}>
                      {column}
                    </span>
                    {match ? (
                      <div style={{ marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem',
                          borderRadius: 4, letterSpacing: '0.03em',
                          backgroundColor: match.risk === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: match.risk === 'high' ? '#ef4444' : '#f59e0b',
                          border: `1px solid ${match.risk === 'high' ? '#ef444440' : '#f59e0b40'}`,
                        }}>
                          {match.risk.toUpperCase()} RISK
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Identifier #{match.number} — {match.label}
                        </span>
                      </div>
                    ) : (
                      <div style={{ marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 500 }}>SAFE — no PHI detected</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Safe Harbor checklist */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: '5rem' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)' }}>
              18 Safe Harbor Identifiers
            </div>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {SAFE_HARBOR_IDENTIFIERS.map(id => {
                const present = presentIdentifierNumbers.has(id.number)
                const isExpanded = expandedIdentifiers.has(id.number)
                const matchingCols = phiColumns.filter(c => c.match?.number === id.number)

                return (
                  <div key={id.number} style={{ borderBottom: '1px solid var(--border)' }}>
                    <button
                      onClick={() => toggleIdentifier(id.number)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                        padding: '0.6rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left',
                        backgroundColor: present ? 'rgba(239,68,68,0.04)' : undefined,
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                        backgroundColor: present ? (id.risk === 'high' ? '#ef4444' : '#f59e0b') : 'rgba(16,185,129,0.2)',
                        color: present ? '#fff' : '#10b981',
                      }}>
                        {id.number}
                      </span>
                      <span style={{ flex: 1, fontSize: '0.82rem', color: present ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: present ? 600 : 400 }}>
                        {id.label}
                      </span>
                      {present
                        ? <span style={{ fontSize: '0.7rem', color: id.risk === 'high' ? '#ef4444' : '#f59e0b', fontWeight: 600, marginRight: '0.25rem' }}>
                            {matchingCols.length} col{matchingCols.length !== 1 ? 's' : ''}
                          </span>
                        : <span style={{ fontSize: '0.7rem', color: '#10b981', marginRight: '0.25rem' }}>clear</span>
                      }
                      {present && (isExpanded ? <ChevronDown size={12} color="var(--text-secondary)" /> : <ChevronRight size={12} color="var(--text-secondary)" />)}
                    </button>

                    {present && isExpanded && (
                      <div style={{ padding: '0.4rem 1rem 0.6rem 3.2rem', backgroundColor: 'rgba(239,68,68,0.04)' }}>
                        <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {id.description}
                        </p>
                        {matchingCols.map(({ column }) => (
                          <span key={column} style={{
                            display: 'inline-block', fontFamily: 'monospace', fontSize: '0.75rem',
                            padding: '0.1rem 0.4rem', marginRight: '0.35rem', marginBottom: '0.25rem',
                            borderRadius: 3, backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.25)',
                          }}>
                            {column}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Summary footer */}
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>{presentIdentifierNumbers.size} present</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{18 - presentIdentifierNumbers.size} clear</span>
              </div>
              <div style={{ marginTop: '0.4rem', height: 4, borderRadius: 2, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(presentIdentifierNumbers.size / 18) * 100}%`, backgroundColor: '#ef4444', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {isCompliant
                  ? 'All 18 identifiers are absent. Dataset may be shared under Safe Harbor.'
                  : 'Remove or de-identify the flagged columns before sharing under Safe Harbor.'
                }
              </p>
            </div>
          </div>

        </div>
      ) : selectedId && !loadingColumns ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          No columns found for this dataset.
        </div>
      ) : !selectedId && !loadingDatasets ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Upload a dataset in <strong style={{ color: 'var(--text-primary)' }}>Dataset Store</strong> to start the HIPAA check.
        </div>
      ) : null}

    </div>
  )
}
