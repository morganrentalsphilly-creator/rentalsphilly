// Print-friendly daily tour sheet. URL: /tours/today/print
//
// Server-rendered, fetches today's tours + the lead context inline so it works
// from a phone browser → AirPrint without needing the admin app.

import { supabaseAdmin } from '@/lib/supabase';
import PrintButton from './print-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Today's tours — Rentals Philly" };

function parseTime(time) {
  if (!time) return 0;
  const [t, ampm] = time.split(' ');
  let [h, m] = t.split(':').map(Number);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + (m || 0);
}

export default async function TodayPrintSheet() {
  const db = supabaseAdmin();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [toursRes, leadsRes, settingsRes] = await Promise.all([
    db.from('tours').select('id, lead_id, date, time, status, listings').eq('date', todayStr),
    db.from('leads').select('id, full_name, email, phone, budget_min, budget_max, beds, baths, areas, credit_score, raw'),
    db.from('settings').select('*').eq('id', 1).single(),
  ]);

  const tours = (toursRes.data || [])
    .filter((t) => t.status !== 'cancelled')
    .sort((a, b) => parseTime(a.time) - parseTime(b.time));
  const leadsById = Object.fromEntries((leadsRes.data || []).map((l) => [l.id, l]));
  const settings = settingsRes.data || {};
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const agentName = settings.agent_name || settings.agentName || 'Morgan';

  return (
    <html lang="en">
      <head>
        <style>{`
          @page { margin: 0.5in; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color: #1c1f2a; padding: 24px; max-width: 8.5in; margin: 0 auto; line-height: 1.4; }
          h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
          .sub { font-size: 12px; color: #64748b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #b58e54; }
          .agent { font-size: 11px; color: #94a3b8; }
          .empty { text-align: center; padding: 80px 0; color: #94a3b8; }
          .tour { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid; }
          .tour-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
          .time { font-size: 28px; font-weight: 700; color: #b58e54; letter-spacing: -0.02em; tabular-nums: true; font-variant-numeric: tabular-nums; }
          .name { font-size: 18px; font-weight: 600; }
          .phone { font-size: 13px; color: #475569; font-variant-numeric: tabular-nums; }
          .addresses { font-size: 14px; margin-bottom: 10px; }
          .addresses .label { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; }
          .addresses ul { margin: 4px 0 0; padding-left: 18px; }
          .addresses li { margin-bottom: 2px; }
          .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; font-size: 11px; }
          .meta .cell .label { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; margin-bottom: 1px; }
          .meta .cell .value { color: #1c1f2a; font-weight: 500; }
          .notes { margin-top: 10px; padding: 8px 10px; background: #fafafa; border-left: 3px solid #b58e54; font-size: 12px; color: #334155; border-radius: 4px; }
          .notes .label { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; margin-bottom: 2px; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
          .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 18px; background: #1c1f2a; color: white; border-radius: 999px; text-decoration: none; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
          @media print {
            .print-btn { display: none; }
            body { padding: 0; }
          }
        `}</style>
      </head>
      <body>
        <PrintButton />

        <div>
          <h1>Today&apos;s Tours</h1>
          <div className="sub">
            {dateLabel} · {tours.length} {tours.length === 1 ? 'tour' : 'tours'}
            <span style={{ float: 'right' }} className="agent">{agentName}</span>
          </div>
        </div>

        {tours.length === 0 ? (
          <div className="empty">No tours today.</div>
        ) : (
          tours.map((t) => {
            const lead = leadsById[t.lead_id] || {};
            const firstName = (lead.full_name || '').split(' ')[0] || 'Lead';
            const addresses = (t.listings || []).map((l) => l.address).filter(Boolean);
            const budget = lead.budget_min && lead.budget_max
              ? `$${Number(lead.budget_min).toLocaleString()} – $${Number(lead.budget_max).toLocaleString()}`
              : '—';
            const notes = lead.raw?.notes || '';
            const picks = Array.isArray(lead.raw?.curated_address_picks) ? lead.raw.curated_address_picks : [];
            return (
              <div key={t.id} className="tour">
                <div className="tour-header">
                  <div>
                    <div className="time">{t.time}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="name">{lead.full_name || 'Lead'}</div>
                    <div className="phone">{lead.phone || ''}{lead.email ? ' · ' + lead.email : ''}</div>
                  </div>
                </div>

                {addresses.length > 0 && (
                  <div className="addresses">
                    <div className="label">Stops</div>
                    <ul>{addresses.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  </div>
                )}

                <div className="meta">
                  <div className="cell">
                    <div className="label">Budget</div>
                    <div className="value">{budget}/mo</div>
                  </div>
                  <div className="cell">
                    <div className="label">Beds / Baths</div>
                    <div className="value">{lead.beds === '0' ? 'Studio' : `${lead.beds || '?'}+ bd`} · {lead.baths || '?'}+ ba</div>
                  </div>
                  <div className="cell">
                    <div className="label">Move-in</div>
                    <div className="value">{lead.move_in_date ? new Date(lead.move_in_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</div>
                  </div>
                  <div className="cell">
                    <div className="label">Credit</div>
                    <div className="value">{lead.credit_score || '—'}</div>
                  </div>
                </div>

                {(lead.areas || picks.length > 0) && (
                  <div className="meta" style={{ marginTop: 6, gridTemplateColumns: '1fr' }}>
                    {lead.areas && (
                      <div className="cell">
                        <div className="label">Preferred areas</div>
                        <div className="value">{lead.areas}</div>
                      </div>
                    )}
                    {picks.length > 0 && (
                      <div className="cell">
                        <div className="label">All properties they picked</div>
                        <div className="value">{picks.slice(0, 5).join(' · ')}{picks.length > 5 ? ` (+${picks.length - 5} more)` : ''}</div>
                      </div>
                    )}
                  </div>
                )}

                {notes && (
                  <div className="notes">
                    <div className="label">Private notes</div>
                    <div>{notes.slice(0, 400)}</div>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="footer">
          Rentals Philly · Generated {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      </body>
    </html>
  );
}
