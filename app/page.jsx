'use client';

import { sendEmail, sendSMS } from '@/lib/messaging';
import { loadAll } from '@/lib/db';
import { createBrowserSupabase } from '@/lib/supabase.client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Home, ArrowRight, ArrowLeft, Check, Calendar, MapPin, Bed, Bath, DollarSign, Clock, Mail, Phone, User, FileText, Users, CalendarDays, Bell, Send, ChevronRight, X, Filter, Star, Sparkles, Building2, CheckCircle2, MessageSquare, Edit3, Activity, Plus, Search, Zap, PhoneCall, FileCheck, Award, ChevronDown, Video, Settings, Hourglass, Info, Flag, Bot, FastForward, Shield, AlertTriangle, ClipboardPaste, ExternalLink, Upload, Download, Trash2, Eye, File, Inbox } from 'lucide-react';
// ============================================================
// DESIGN TOKENS — single source of truth for spacing/colors
// ============================================================
// Radius: rounded-lg (8px), rounded-xl (12px), rounded-2xl (16px), rounded-full
// Spacing: stick to 4/8/12/16/24/32/48
// Borders: border-slate-200 for all surfaces, border-slate-100 for internal dividers
// Text: text-slate-900 primary, text-slate-600 secondary, text-slate-500 tertiary, text-slate-400 quaternary

// ============================================================
// MOCK LISTINGS
// ============================================================
const MOCK_LISTINGS = [
  { id: 'l1', mls: 'PAPH2301420', address: '1420 Pine St, Unit 3B', neighborhood: 'Rittenhouse', zip: '19102', price: 2400, beds: 1, baths: 1, sqft: 720, image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', leasingContact: 'leasing@rittenhouseapts.com', leasingOffice: 'Rittenhouse Residential', listingAgent: 'Sarah Chen', listingAgentPhone: '(215) 555-0101' },
  { id: 'l2', mls: 'PAPH2302340', address: '234 N 3rd St, Apt 5', neighborhood: 'Old City', zip: '19106', price: 2850, beds: 2, baths: 1, sqft: 950, image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800', leasingContact: 'rentals@oldcityliving.com', leasingOffice: 'Old City Living', listingAgent: 'Marcus Webb', listingAgentPhone: '(215) 555-0102' },
  { id: 'l3', mls: 'PAPH2308760', address: '876 S 4th St', neighborhood: 'Queen Village', zip: '19147', price: 2100, beds: 1, baths: 1, sqft: 680, image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800', leasingContact: 'hello@qvrentals.com', leasingOffice: 'Queen Village Properties', listingAgent: 'Dana Rosario', listingAgentPhone: '(215) 555-0103' },
  { id: 'l4', mls: 'PAPH2315001', address: '1500 Locust St, Unit 12A', neighborhood: 'Rittenhouse', zip: '19102', price: 3200, beds: 2, baths: 2, sqft: 1100, image: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800', leasingContact: 'info@locust1500.com', leasingOffice: 'Locust Tower Residences', listingAgent: 'Priya Nair', listingAgentPhone: '(215) 555-0104' },
  { id: 'l5', mls: 'PAPH2304450', address: '445 N 2nd St', neighborhood: 'Northern Liberties', zip: '19123', price: 2650, beds: 2, baths: 2, sqft: 1050, image: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800', leasingContact: 'lease@nolibs.com', leasingOffice: 'NoLibs Management', listingAgent: 'Tom Halloway', listingAgentPhone: '(215) 555-0105' },
  { id: 'l6', mls: 'PAPH2321000', address: '2100 Walnut St, Apt 7F', neighborhood: 'Rittenhouse', zip: '19103', price: 1950, beds: 1, baths: 1, sqft: 620, image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800', leasingContact: 'rentals@walnut2100.com', leasingOffice: 'Walnut Street Residential', listingAgent: 'Ellie Park', listingAgentPhone: '(215) 555-0106' },
  { id: 'l7', mls: 'PAPH2312150', address: '1215 Frankford Ave', neighborhood: 'Fishtown', zip: '19125', price: 2250, beds: 2, baths: 1, sqft: 880, image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800', leasingContact: 'lease@fishtownflats.com', leasingOffice: 'Fishtown Flats', listingAgent: 'Jordan Mills', listingAgentPhone: '(215) 555-0107' },
  { id: 'l8', mls: 'PAPH2308800', address: '88 N 20th St, Unit 14', neighborhood: 'Logan Square', zip: '19103', price: 3450, beds: 2, baths: 2, sqft: 1200, image: 'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=800', leasingContact: 'info@logansq.com', leasingOffice: 'Logan Square Tower', listingAgent: 'Reece Adaku', listingAgentPhone: '(215) 555-0108' },
];

// ============================================================
// HELPERS
// ============================================================
const classifyLead = (lead) => {
  const today = new Date();
  const moveDate = new Date(lead.moveInDate);
  const daysUntilMove = Math.ceil((moveDate - today) / (1000 * 60 * 60 * 24));
  const goodCredit = ['650-699', '700-749', '750+'].includes(lead.creditScore);
  const soonMove = daysUntilMove <= 75;
  if (goodCredit && soonMove) return 'GCMS';
  if (goodCredit && !soonMove) return 'GCM75+';
  if (!goodCredit && soonMove) return 'BCMS';
  return 'BC75+';
};

const bucketInfo = {
  'GCMS': { label: 'Good credit, moving soon' },
  'GCM75+': { label: 'Good credit, moving later' },
  'BCMS': { label: 'Limited credit, moving soon' },
  'BC75+': { label: 'Limited credit, moving later' },
};

const matchListings = (lead) => {
  return MOCK_LISTINGS.filter(l => {
    const priceOk = l.price >= (lead.budgetMin || 0) && l.price <= (lead.budgetMax || 99999);
    const bedsOk = !lead.beds || l.beds >= parseInt(lead.beds);
    const bathsOk = !lead.baths || l.baths >= parseInt(lead.baths);
    const areaOk = !lead.areas || lead.areas.trim() === '' ||
      lead.areas.toLowerCase().split(/[,;]/).some(a => {
        const q = a.trim();
        return q && (l.neighborhood.toLowerCase().includes(q) || l.zip.includes(q));
      });
    return priceOk && bedsOk && bathsOk && areaOk;
  });
};

const DEFAULT_AGENT_SETTINGS = {
  agentName: '[Your name]',
  agentEmail: 'agent@rentalsphilly.com',
  agentPhone: '(215) 555-0100',
  twilioNumber: '(267) 555-0199',
  rentSpree: {
    dashboardUrl: 'https://app.rentspree.com/dashboard',
  },
  automation: {
    enabled: true,
    autoCompleteTours: true,
    autoNudgeNoResponse: true,
    autoArchiveStale: true,
    notifyWhenSlotsEmpty: true,
  },
  _slotsEmptyNotifiedAt: null,
};

const TOUR_WINDOW = { minHoursAhead: 48, maxDaysAhead: 10 };
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

// ---- Tour timing constants ----
const SHOWING_MINUTES = 15;          // time at each property
const POST_TOUR_BUFFER_MINUTES = 15; // buffer after a tour ends before next tour can start
const AVG_CITY_SPEED_MPH = 18;       // avg Philly driving speed incl. stops/parking

// ---- Philly-area rough center coords for geocoding fallback ----
// For properties without explicit lat/lng, we estimate from zip code
const ZIP_CENTERS = {
  '19102': { lat: 39.9500, lng: -75.1667 }, // Rittenhouse/Center City
  '19103': { lat: 39.9522, lng: -75.1758 }, // Logan Square/Rittenhouse West
  '19106': { lat: 39.9500, lng: -75.1460 }, // Old City
  '19107': { lat: 39.9497, lng: -75.1573 }, // Washington Square
  '19123': { lat: 39.9649, lng: -75.1466 }, // Northern Liberties
  '19125': { lat: 39.9716, lng: -75.1293 }, // Fishtown
  '19130': { lat: 39.9700, lng: -75.1740 }, // Fairmount
  '19146': { lat: 39.9381, lng: -75.1800 }, // Graduate Hospital
  '19147': { lat: 39.9381, lng: -75.1520 }, // Queen Village/Bella Vista
  '19148': { lat: 39.9200, lng: -75.1600 }, // South Philly/Passyunk
  '19104': { lat: 39.9526, lng: -75.1932 }, // University City
};

// Try to get coordinates for a listing. Uses explicit lat/lng if present,
// otherwise falls back to zip code center, otherwise center city default.
const getListingCoords = (listing) => {
  if (listing.lat && listing.lng) return { lat: listing.lat, lng: listing.lng };
  if (listing.zip && ZIP_CENTERS[listing.zip]) return ZIP_CENTERS[listing.zip];
  // Default: Philly center city
  return { lat: 39.9526, lng: -75.1652 };
};

// ---- Haversine distance (miles) between two lat/lng points ----
const haversineMiles = (a, b) => {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
};

// ---- Estimated driving minutes between two listings (haversine + fudge factor) ----
// Multiply straight-line by 1.3 to approximate road distance, then divide by speed
const estimateTravelMinutes = (listingA, listingB) => {
  const coordsA = getListingCoords(listingA);
  const coordsB = getListingCoords(listingB);
  const miles = haversineMiles(coordsA, coordsB) * 1.3; // road factor
  const minutes = (miles / AVG_CITY_SPEED_MPH) * 60;
  // Round up to nearest 5 min, min of 5 min for any travel
  return Math.max(5, Math.ceil(minutes / 5) * 5);
};

// ---- Optimize tour order using nearest-neighbor heuristic ----
// Given a list of listings, returns them reordered for efficient driving.
// Starts from the listing closest to the geographic centroid, then visits
// each subsequent nearest unvisited listing.
const optimizeTourOrder = (listings) => {
  if (listings.length <= 1) return listings;
  if (listings.length === 2) return listings; // only one order matters

  const coords = listings.map(getListingCoords);

  // Find centroid
  const centroid = {
    lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
  };

  // Start with the listing closest to centroid
  let startIdx = 0;
  let minDist = Infinity;
  coords.forEach((c, i) => {
    const d = haversineMiles(centroid, c);
    if (d < minDist) { minDist = d; startIdx = i; }
  });

  // Nearest-neighbor from there
  const ordered = [listings[startIdx]];
  const remaining = listings.filter((_, i) => i !== startIdx);

  while (remaining.length > 0) {
    const currentCoords = getListingCoords(ordered[ordered.length - 1]);
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((listing, i) => {
      const d = haversineMiles(currentCoords, getListingCoords(listing));
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    ordered.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  // 2-opt refinement pass: try swapping pairs to see if total distance improves
  const tourLength = (arr) => {
    let total = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      total += haversineMiles(getListingCoords(arr[i]), getListingCoords(arr[i + 1]));
    }
    return total;
  };
  let improved = true;
  let current = [...ordered];
  let iterations = 0;
  while (improved && iterations < 20) {
    improved = false;
    iterations++;
    for (let i = 1; i < current.length - 1; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const candidate = [...current];
        // Reverse segment between i and j
        candidate.splice(i, j - i + 1, ...candidate.slice(i, j + 1).reverse());
        if (tourLength(candidate) < tourLength(current)) {
          current = candidate;
          improved = true;
        }
      }
    }
  }

  return current;
};

// ---- Build full itinerary with timing ----
// Given an ordered list of listings + a start time (Date), returns an array
// of { listing, startTime, endTime, travelToNext } for each stop.
// Within-tour: showing (15min), then travel to next, no buffer between stops.
const buildTourItinerary = (listings, startDateTime) => {
  if (listings.length === 0) return [];
  const itinerary = [];
  let currentTime = new Date(startDateTime);
  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    const showingStart = new Date(currentTime);
    const showingEnd = new Date(currentTime.getTime() + SHOWING_MINUTES * 60000);
    let travelToNext = 0;
    if (i < listings.length - 1) {
      travelToNext = estimateTravelMinutes(listing, listings[i + 1]);
      currentTime = new Date(showingEnd.getTime() + travelToNext * 60000);
    } else {
      currentTime = showingEnd;
    }
    itinerary.push({
      ...listing,
      order: i + 1,
      startTime: showingStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      endTime: showingEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      startDateTime: showingStart.toISOString(),
      endDateTime: showingEnd.toISOString(),
      travelToNext,
    });
  }
  return itinerary;
};

// ---- Tour duration helper ----
// Total minutes from start of first showing to end of last showing.
const getTourDurationMinutes = (listings) => {
  if (listings.length === 0) return 0;
  if (listings.length === 1) return SHOWING_MINUTES;
  let total = SHOWING_MINUTES * listings.length;
  for (let i = 0; i < listings.length - 1; i++) {
    total += estimateTravelMinutes(listings[i], listings[i + 1]);
  }
  return total;
};

// ---- End-time of a tour (for conflict checking) ----
const getTourEndTime = (tour) => {
  const start = parseSlotDateTime({ date: tour.date, time: tour.time });
  const durationMin = getTourDurationMinutes(tour.listings || []);
  return new Date(start.getTime() + durationMin * 60000);
};

// ---- Earliest time the NEXT tour can start after a given tour ----
// = end of tour + 15 min buffer + travel from last property to next-tour's first property
// If we don't know the next tour's first property yet, just add buffer + conservative 10 min travel estimate
const getEarliestNextTourStart = (tour, nextFirstListing = null) => {
  const end = getTourEndTime(tour);
  const lastListing = (tour.listings || [])[(tour.listings || []).length - 1];
  let travelMin = 10; // conservative estimate if we don't know where they're going
  if (lastListing && nextFirstListing) {
    travelMin = estimateTravelMinutes(lastListing, nextFirstListing);
  }
  return new Date(end.getTime() + (POST_TOUR_BUFFER_MINUTES + travelMin) * 60000);
};

const generateDefaultSlots = () => {
  const slots = [];
  const now = new Date();
  const start = new Date(now.getTime() + TOUR_WINDOW.minHoursAhead * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  for (let d = 0; d < 5; d++) {
    const day = new Date(start);
    day.setDate(start.getDate() + d);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = day.toISOString().split('T')[0];
    ['10:00 AM', '2:00 PM', '4:00 PM'].forEach(t => {
      slots.push({ id: `s_${dateStr}_${t.replace(/[:\s]/g, '')}`, date: dateStr, time: t, status: 'open' });
    });
  }
  return slots;
};

const parseSlotDateTime = (slot) => {
  const [time, ampm] = slot.time.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const d = new Date(slot.date + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
};

const slotIsBookable = (slot) => {
  if (!slot || slot.status !== 'open') return false;
  const slotDateTime = parseSlotDateTime(slot);
  const now = new Date();
  const minAhead = new Date(now.getTime() + TOUR_WINDOW.minHoursAhead * 60 * 60 * 1000);
  const maxAhead = new Date(now);
  maxAhead.setDate(maxAhead.getDate() + TOUR_WINDOW.maxDaysAhead);
  return slotDateTime >= minAhead && slotDateTime <= maxAhead;
};

const interpretScreeningReport = (report, lead) => {
  const flags = [];
  const strengths = [];
  let recommendation = 'approve';

  const score = Number(report.creditScore) || 0;
  if (score > 0) {
    if (score < 580) { flags.push(`Credit score below 580 (${score})`); recommendation = 'flag'; }
    else if (score < 620) { flags.push(`Credit score below 620 (${score})`); if (recommendation === 'approve') recommendation = 'conditional'; }
    else if (score >= 720) { strengths.push(`Strong credit: ${score}`); }
  } else {
    flags.push('No credit score entered');
    if (recommendation === 'approve') recommendation = 'conditional';
  }

  const onTime = Number(report.onTimePaymentRate);
  if (!isNaN(onTime) && onTime > 0) {
    if (onTime < 85) { flags.push(`${Math.round(onTime)}% on-time payment history`); recommendation = 'flag'; }
    else if (onTime >= 95) { strengths.push(`${onTime}% on-time payments`); }
  }

  const util = Number(report.creditUtilization);
  if (!isNaN(util) && util > 0 && util > 80) {
    flags.push(`High credit utilization (${util}%)`);
    if (recommendation === 'approve') recommendation = 'conditional';
  }

  if (report.evictionHistory === 'Match found') { flags.push('Eviction record found'); recommendation = 'flag'; }
  if (report.criminalMajor === 'Match found') { flags.push('Criminal record flagged — legal review needed'); recommendation = 'flag'; }
  if (report.sexOffenderRegistry === 'Match found') { flags.push('Sex offender registry match — DO NOT proceed'); recommendation = 'flag'; }
  if (report.ofacWatchlist === 'Match found') { flags.push('OFAC watchlist match — DO NOT proceed'); recommendation = 'flag'; }

  const derog = Number(report.derogatoryMarks);
  if (!isNaN(derog) && derog > 0) {
    flags.push(`${derog} derogatory mark${derog > 1 ? 's' : ''}`);
    if (recommendation === 'approve') recommendation = 'conditional';
  }

  const residenceScore = Number(report.residenceScore);
  if (!isNaN(residenceScore) && residenceScore > 0) {
    if (residenceScore >= 700) strengths.push(`High residence score: ${residenceScore}`);
    if (residenceScore < 500) { flags.push(`Low residence score: ${residenceScore}`); recommendation = 'flag'; }
  }

  const summary = `${score || '—'} credit · ${residenceScore || '—'} residence · ${flags.length} flag${flags.length === 1 ? '' : 's'}`;
  return { flags, strengths, recommendation, summary };
};

const runAutomation = async ({ leads, slots, settings, now }) => {
  const updates = {};

  const mergeLead = (leadId, patch) => {
    const existing = updates[leadId] || { ...leads.find(l => l.id === leadId) };
    if (!existing.id) return;
    for (const k of Object.keys(patch)) {
      if (Array.isArray(patch[k]) && Array.isArray(existing[k])) {
        existing[k] = [...existing[k], ...patch[k]];
      } else {
        existing[k] = patch[k];
      }
    }
    updates[leadId] = existing;
  };

  const activity = (msg, type = 'automation') => ({ id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type, timestamp: now.toISOString(), message: msg });
  const autoMsg = (lead, channel, subject, body) => ({
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    channel, direction: 'outbound', status: 'sent',
    to: channel === 'sms' ? lead.phone : lead.email,
    via: channel === 'sms' ? 'twilio' : 'gmail',
    subject, body,
    timestamp: now.toISOString(), automated: true,
  });

  for (const lead of leads) {
    const firstName = lead.fullName.split(' ')[0];

    for (const tour of (lead.tours || [])) {
      if (tour.status !== 'scheduled') continue;
      const end = parseSlotDateTime({ date: tour.date, time: tour.time });
      const dur = (tour.listings?.length || 1) * 45 + 60;
      end.setMinutes(end.getMinutes() + dur);
      if (now > end) {
        const props = tour.listings || [];
        const tourList = props.map((p, i) => `${i + 1}. ${p.address} — ${p.neighborhood}`).join('\n');
        const isVirtual = tour.tourType === 'virtual';
        const body = `Hi ${firstName} — thanks for ${isVirtual ? 'the virtual tour' : 'touring'} today! You saw:\n\n${tourList}\n\nReply with the one that stood out and I'll start your application.`;
        const email = autoMsg(lead, 'email', 'Thanks for touring — which one?', body);
        // Actually send the post-tour SMS via the server wrapper.
        const ptSmsBody = `Rentals Philly: Thanks ${firstName}! Which property stood out?`;
        let smsRow = null;
        if (lead.id) {
          const result = await sendSMS({
            leadId: lead.id,
            body: ptSmsBody,
            kind: 'nudge_48hr',
            idempotencyKey: `post-tour-${tour.id}`,
            automated: true,
          });
          if (result?.ok && result.message) {
            smsRow = {
              id: result.message.id, channel: 'sms', direction: 'outbound',
              status: result.message.status || 'sent',
              to: result.message.to, via: 'twilio',
              body: result.message.body,
              timestamp: result.message.created_at || now.toISOString(),
              automated: true,
            };
          }
        }
        const nudge48 = new Date(now); nudge48.setHours(now.getHours() + 48);
        const nudge5d = new Date(now); nudge5d.setDate(now.getDate() + 5);
        mergeLead(lead.id, {
          tours: (updates[lead.id]?.tours || lead.tours).map(t => t.id === tour.id ? { ...t, status: 'completed', completedAt: now.toISOString(), autoCompleted: true } : t),
          stage: 'post-tour',
          messages: [email, smsRow].filter(Boolean),
          activities: [activity(`Tour auto-completed. Post-tour follow-up sent.`, 'auto-complete')],
          scheduledNudges: [
            ...(lead.scheduledNudges || []),
            { id: `n_${Date.now()}_1`, type: 'post-tour-48hr', scheduledFor: nudge48.toISOString(), tourId: tour.id, status: 'scheduled' },
            { id: `n_${Date.now()}_2`, type: 'post-tour-5day', scheduledFor: nudge5d.toISOString(), tourId: tour.id, status: 'scheduled' },
          ],
          tasks: (updates[lead.id]?.tasks || lead.tasks || []).map(t => t.relatedTourId === tour.id ? { ...t, status: 'done', completedAt: now.toISOString() } : t),
        });
      }
    }

    const pendingNudges = (updates[lead.id]?.scheduledNudges || lead.scheduledNudges || []).filter(n => n.status === 'scheduled');
    for (const nudge of pendingNudges) {
      if (new Date(nudge.scheduledFor) > now) continue;
      if (['applied', 'leased', 'lost'].includes(lead.stage)) {
        mergeLead(lead.id, {
          scheduledNudges: (updates[lead.id]?.scheduledNudges || lead.scheduledNudges || []).map(n => n.id === nudge.id ? { ...n, status: 'skipped' } : n),
        });
        continue;
      }
      let email, smsBody, smsKind;
      if (nudge.type === 'post-tour-48hr') {
        email = autoMsg(lead, 'email', 'Still thinking it over?', `Hi ${firstName} — just checking in on the places you toured.`);
        smsBody = `Rentals Philly: Hey ${firstName}, any favorites from the tour?`;
        smsKind = 'nudge_48hr';
      } else if (nudge.type === 'post-tour-5day') {
        email = autoMsg(lead, 'email', 'Fresh options?', `Hi ${firstName} — want a fresh batch of listings?`);
      }

      // Actually send the SMS nudge via the server wrapper. The DB row it
      // creates becomes the source of truth — we splice it into the in-memory
      // lead.messages so the UI stays consistent.
      let smsRow = null;
      if (smsBody && lead.id) {
        const result = await sendSMS({
          leadId: lead.id,
          body: smsBody,
          kind: smsKind,
          idempotencyKey: `${smsKind}-${nudge.id}`,
          automated: true,
        });
        if (result?.ok && result.message) {
          smsRow = {
            id: result.message.id, channel: 'sms', direction: 'outbound',
            status: result.message.status || 'sent',
            to: result.message.to, via: 'twilio',
            body: result.message.body,
            timestamp: result.message.created_at || now.toISOString(),
            automated: true,
          };
        }
      }

      const msgs = [email, smsRow].filter(Boolean);
      mergeLead(lead.id, {
        messages: msgs,
        scheduledNudges: (updates[lead.id]?.scheduledNudges || lead.scheduledNudges || []).map(n => n.id === nudge.id ? { ...n, status: 'sent', sentAt: now.toISOString() } : n),
        activities: [activity(`Auto-nudge sent (${nudge.type})`, 'auto-nudge')],
      });
    }

    if (!['leased', 'lost', 'archived'].includes(lead.stage)) {
      const allActivities = (updates[lead.id]?.activities || lead.activities || []);
      const lastActivity = allActivities.length > 0 ? new Date(allActivities[allActivities.length - 1].timestamp) : new Date(lead.createdAt);
      const daysSince = (now - lastActivity) / (1000 * 60 * 60 * 24);
      if (daysSince > 30) {
        const email = autoMsg(lead, 'email', 'Leaving the door open', `Hi ${firstName} — pausing outreach. Reply any time.`);
        mergeLead(lead.id, {
          stage: 'archived',
          messages: [email],
          activities: [activity('Auto-archived after 30 days of no activity.', 'auto-archive')],
        });
      }
    }
  }

  return { leadUpdates: updates };
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
const fmtCurrency = (n) => `$${Number(n).toLocaleString()}`;
const fmtFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
function timeAgo(iso) {
  const mins = Math.floor((new Date() - new Date(iso)) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================
// REUSABLE UI PRIMITIVES
// ============================================================

function Pill({ tone = 'neutral', icon: Icon, children, className = '' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    positive: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
    info: 'bg-blue-50 text-blue-700',
    accent: 'bg-indigo-50 text-indigo-700',
    dark: 'bg-slate-900 text-white',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]} ${className}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

function Button({ variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, children, className = '', ...props }) {
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
    outline: 'border border-slate-200 text-slate-900 hover:bg-slate-50 disabled:opacity-40',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-3 text-sm',
    xl: 'px-6 py-3.5 text-[15px]',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
      {IconRight && <IconRight className="w-4 h-4" />}
    </button>
  );
}

function Card({ children, className = '', ...props }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white ${className}`} {...props}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</div>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="border border-dashed border-slate-200 rounded-2xl p-12 text-center">
      {Icon && (
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-slate-400" strokeWidth={1.5} />
        </div>
      )}
      <div className="font-semibold text-slate-900 mb-1">{title}</div>
      {desc && <div className="text-sm text-slate-500 max-w-xs mx-auto">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  const [view, setView] = useState('landing');
  const [leads, setLeads] = useState([]);
  const [slots, setSlots] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_AGENT_SETTINGS);
  const [timeOffset, setTimeOffset] = useState(0);
  const [currentLead, setCurrentLead] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [adminSubview, setAdminSubview] = useState('dashboard');
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [toast, setToast] = useState(null);

  const getNow = () => new Date(Date.now() + timeOffset);

  useEffect(() => {
    (async () => {
      try {
        const data = await loadAll();
        setLeads(data.leads || []);
        setSlots((data.slots || []).length > 0 ? data.slots : generateDefaultSlots());
        setWaitlist(data.waitlist || []);
        if (data.settings) setSettings({ ...DEFAULT_AGENT_SETTINGS, ...data.settings });
        // Still load timeOffset from localStorage (dev-only feature, not worth a DB trip)
        try {
          const offsetRes = await window.storage.get('time-offset').catch(() => null);
          if (offsetRes && offsetRes.value) setTimeOffset(JSON.parse(offsetRes.value));
        } catch (e) {}
      } catch (e) {
        console.error('[app] Failed to load data from Supabase', e);
      }
      setLoaded(true);
    })();
  }, []);

  // ---- Supabase Realtime: live inbox updates ------------------------------
  // Subscribe to INSERTs on the `messages` table and merge each new row into
  // the matching lead's in-memory messages array. This is how inbound SMS
  // replies and outbound status changes show up in the inbox without a refresh.
  useEffect(() => {
    if (!loaded) return;
    const supa = createBrowserSupabase();
    if (!supa) return;
    const channel = supa
      .channel('messages-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new;
          if (!row || !row.lead_id) return;
          setLeads((prev) => prev.map((l) => {
            if (l.id !== row.lead_id) return l;
            // Skip if we already have this message (optimistic insert).
            if ((l.messages || []).some((m) => m.id === row.id)) return l;
            const incoming = {
              id: row.id,
              channel: row.channel,
              direction: row.direction,
              status: row.status,
              to: row.to,
              via: row.via,
              subject: row.subject,
              body: row.body,
              timestamp: row.created_at || new Date().toISOString(),
              automated: !!row.automated,
            };
            return { ...l, messages: [...(l.messages || []), incoming] };
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new;
          if (!row || !row.lead_id) return;
          setLeads((prev) => prev.map((l) => {
            if (l.id !== row.lead_id) return l;
            return {
              ...l,
              messages: (l.messages || []).map((m) =>
                m.id === row.id
                  ? { ...m, status: row.status, body: row.body }
                  : m
              ),
            };
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          // Reflect opt-out status changes immediately in the UI.
          setLeads((prev) => prev.map((l) =>
            l.id === row.id
              ? { ...l, opted_out: row.opted_out, opted_out_at: row.opted_out_at }
              : l
          ));
        }
      )
      .subscribe();
    return () => {
      try { supa.removeChannel(channel); } catch {}
    };
  }, [loaded]);

  // In the Supabase world, we only call saveLeads for bulk operations.
  // The main bulk op is "clear all" from the leads list.
  // Individual inserts/updates go through addLead / updateLead.
  const saveLeads = async (newLeads) => {
    setLeads(newLeads);
    // If the array is empty, it's a "clear all" — delete all leads from Supabase
    if (newLeads.length === 0 && leads.length > 0) {
      try {
        const db = await import('@/lib/db');
        await db.deleteAllLeads();
      } catch (e) {
        console.error('[app] Failed to clear leads', e);
      }
    }
  };
// Slots live in Supabase. Bulk update: we diff against the current state.
  // Call site generally replaces the whole array, so we upsert all + delete any missing.
  const saveSlots = async (newSlots) => {
    setSlots(newSlots);
    try {
      const db = await import('@/lib/db');
      // Upsert each slot
      for (const s of newSlots) {
        await db.upsertSlot({
          id: s.id,
          date: s.date,
          time: s.time,
          status: s.status || 'open',
          booked_by: s.bookedBy || null,
        });
      }
      // Delete slots that were removed
      const newIds = new Set(newSlots.map(s => s.id));
      for (const existing of slots) {
        if (!newIds.has(existing.id)) {
          await db.deleteSlot(existing.id);
        }
      }
    } catch (e) {
      console.error('[app] Failed to save slots', e);
    }
  };
  const saveWaitlist = async (newWaitlist) => {
    setWaitlist(newWaitlist);
    try {
      const db = await import('@/lib/db');
      // Find entries that are new (not already in state)
      const existingIds = new Set(waitlist.map(w => w.id));
      const newEntries = newWaitlist.filter(w => !existingIds.has(w.id));
      for (const entry of newEntries) {
        await db.insertWaitlist({
          id: entry.id,
          lead_id: entry.leadId,
          preferred_dates: entry.preferredDates,
          status: entry.status || 'waiting',
        });
      }
    } catch (e) {
      console.error('[app] Failed to save waitlist', e);
    }
  };
  const saveSettings = async (newSettings) => {
    setSettings(newSettings);
    try {
      const { updateSettings } = await import('@/lib/db');
      await updateSettings({
        agent_name: newSettings.agentName,
        agent_email: newSettings.agentEmail,
        agent_phone: newSettings.agentPhone,
        twilio_number: newSettings.twilioNumber,
        rentspree_dashboard_url: newSettings.rentSpree?.dashboardUrl,
        automation: newSettings.automation,
      });
    } catch (e) {
      console.error('[app] Failed to save settings', e);
    }
  };
  const saveTimeOffset = async (offset) => {
    setTimeOffset(offset);
    try { await window.storage.set('time-offset', JSON.stringify(offset)); } catch (e) {}
  };

  useEffect(() => {
    if (!loaded) return;
    if (settings.automation?.enabled === false) return;
    const runIt = async () => {
      const now = getNow();
      const { leadUpdates } = await runAutomation({ leads, slots, waitlist, settings, now });
      const updatedIds = Object.keys(leadUpdates);
      if (updatedIds.length > 0) {
        const merged = leads.map(l => leadUpdates[l.id] || l);
        await saveLeads(merged);
      }
    };
    runIt();
    const interval = setInterval(runIt, 30000);
    return () => clearInterval(interval);
  }, [loaded, leads, slots, waitlist, settings, timeOffset]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Update a lead in Supabase + sync newly-added nested items (messages/activities/tasks/submissions).
  // Strategy: for each nested array, compare current-in-state vs updates, and persist anything new.
  const updateLead = async (id, updates) => {
    const existing = leads.find(l => l.id === id);
    const merged = { ...existing, ...updates };
    const updated = leads.map(l => l.id === id ? merged : l);
    setLeads(updated);
    if (currentLead?.id === id) setCurrentLead({ ...currentLead, ...updates });

    try {
      const db = await import('@/lib/db');

      // 1. Persist direct lead field updates (skip nested arrays — those go separately)
      const { messages, activities, tasks, tours, submissions, scheduledNudges, followUps, ...leadFields } = updates;
      const leadUpdatePayload = {};
      if ('stage' in leadFields) leadUpdatePayload.stage = leadFields.stage;
      if ('application' in leadFields) leadUpdatePayload.application = leadFields.application;
      if ('applicationStatus' in leadFields) leadUpdatePayload.application_status = leadFields.applicationStatus;
      if ('screening' in leadFields) leadUpdatePayload.screening = leadFields.screening;
      if ('bucket' in leadFields) leadUpdatePayload.bucket = leadFields.bucket;
      if (Object.keys(leadUpdatePayload).length > 0) {
        await db.updateLead(id, leadUpdatePayload);
      }

      // 2. For each nested array in updates, insert new items
      const existingMsgIds = new Set((existing?.messages || []).map(m => m.id));
      const newMessages = (messages || []).filter(m => !existingMsgIds.has(m.id));
      for (const m of newMessages) {
        await db.insertMessage({
          id: m.id, lead_id: id,
          channel: m.channel, direction: m.direction, status: m.status,
          to: m.to, via: m.via, subject: m.subject, body: m.body,
          automated: !!m.automated, internal: !!m.internal,
        });
      }

      const existingActIds = new Set((existing?.activities || []).map(a => a.id));
      const newActs = (activities || []).filter(a => !existingActIds.has(a.id));
      for (const a of newActs) {
        await db.insertActivity({ id: a.id, lead_id: id, type: a.type, message: a.message });
      }

      const existingTaskIds = new Set((existing?.tasks || []).map(t => t.id));
      const updatedTaskIds = new Set((tasks || []).map(t => t.id));
      // New tasks → insert
      const newTasks = (tasks || []).filter(t => !existingTaskIds.has(t.id));
      for (const t of newTasks) {
        await db.insertTask({
          id: t.id, lead_id: id, title: t.title, due_date: t.dueDate,
          status: t.status, priority: t.priority, auto: !!t.auto,
          completed_at: t.completedAt || null,
          related_tour_id: t.relatedTourId || null,
          related_submission_id: t.relatedSubmissionId || null,
          flags: t.flags || null,
        });
      }
      // Existing tasks that changed status/completion → update
      for (const t of (tasks || [])) {
        if (!existingTaskIds.has(t.id)) continue;
        const prev = (existing?.tasks || []).find(x => x.id === t.id);
        if (prev && (prev.status !== t.status || prev.completedAt !== t.completedAt)) {
          await db.updateTask(t.id, { status: t.status, completed_at: t.completedAt || null });
        }
      }

      const existingTourIds = new Set((existing?.tours || []).map(t => t.id));
      const newTours = (tours || []).filter(t => !existingTourIds.has(t.id));
      for (const t of newTours) {
        await db.insertTour({
          id: t.id, lead_id: id, tour_type: t.tourType,
          date: t.date, time: t.time, status: t.status,
          listings: t.listings, schedule: t.schedule,
          completed_at: t.completedAt || null,
          auto_completed: !!t.autoCompleted,
        });
      }
      // Updated tours (completed, etc.)
      for (const t of (tours || [])) {
        if (!existingTourIds.has(t.id)) continue;
        const prev = (existing?.tours || []).find(x => x.id === t.id);
        if (prev && (prev.status !== t.status || prev.completedAt !== t.completedAt)) {
          await db.updateTour(t.id, {
            status: t.status,
            completed_at: t.completedAt || null,
            auto_completed: !!t.autoCompleted,
          });
        }
      }

      const existingSubIds = new Set((existing?.submissions || []).map(s => s.id));
      const newSubs = (submissions || []).filter(s => !existingSubIds.has(s.id));
      for (const s of newSubs) {
        await db.insertSubmission({
          id: s.id, lead_id: id, listing: s.listing,
          landlord_email: s.landlordEmail, landlord_name: s.landlordName,
          email_subject: s.emailSubject, email_body: s.emailBody,
          status: s.status, notes: s.notes || '',
          follow_ups: s.followUps || [],
        });
      }
      // Existing submissions changed (status update, follow-up added)
      for (const s of (submissions || [])) {
        if (!existingSubIds.has(s.id)) continue;
        const prev = (existing?.submissions || []).find(x => x.id === s.id);
        if (!prev) continue;
        const subUpdates = {};
        if (prev.status !== s.status) {
          subUpdates.status = s.status;
          subUpdates.status_updated_at = s.statusUpdatedAt || new Date().toISOString();
        }
        if ((prev.followUps?.length || 0) !== (s.followUps?.length || 0)) {
          subUpdates.follow_ups = s.followUps || [];
        }
        if (Object.keys(subUpdates).length > 0) {
          await db.updateSubmission(s.id, subUpdates);
        }
      }
    } catch (e) {
      console.error('[app] Failed to update lead', e);
    }
  };

  const joinWaitlist = async (leadId, preferredDates) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const entry = { id: `w_${Date.now()}`, leadId, preferredDates, createdAt: new Date().toISOString(), status: 'waiting' };
    await saveWaitlist([...waitlist, entry]);
    const newMsg = {
      id: `m_${Date.now()}`, channel: 'email', direction: 'outbound', status: 'sent',
      to: lead.email, via: 'gmail', subject: 'You\'re on the waitlist',
      body: `Hi ${lead.fullName.split(' ')[0]} — you're on the waitlist! The moment a new tour slot opens for your dates, I'll email & text you.`,
      timestamp: new Date().toISOString(), automated: true,
    };
    await updateLead(leadId, {
      messages: [...(lead.messages || []), newMsg],
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'waitlisted', timestamp: new Date().toISOString(), message: `Added to waitlist (${preferredDates.length} dates)` }],
    });
  };

  const openSlot = async (slotData) => {
    const id = `s_${slotData.date}_${slotData.time.replace(/[:\s]/g, '')}`;
    const existing = slots.find(s => s.id === id);
    let newSlots;
    if (existing) newSlots = slots.map(s => s.id === id ? { ...s, status: 'open' } : s);
    else newSlots = [...slots, { id, date: slotData.date, time: slotData.time, status: 'open' }];
    await saveSlots(newSlots);
    const matching = waitlist.filter(w => w.status === 'waiting' && w.preferredDates.includes(slotData.date));
    return matching.length;
  };

  const closeSlot = async (slotId) => {
    await saveSlots(slots.filter(s => s.id !== slotId));
  };

  const saveScreeningReport = async (leadId, reportInput) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const firstName = lead.fullName.split(' ')[0];
    const interpretation = interpretScreeningReport(reportInput, lead);
    const report = {
      ...reportInput,
      reportId: reportInput.reportId || `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      enteredAt: new Date().toISOString(),
      provider: 'RentSpree (manual entry)',
    };
    const internalEmail = {
      id: `m_${Date.now()}_rsd`, channel: 'email', direction: 'internal', status: 'sent',
      to: settings.agentEmail, via: 'gmail',
      subject: `[SCREENING LOGGED] ${lead.fullName} — ${interpretation.summary}`,
      body: `Recommendation: ${interpretation.recommendation.toUpperCase()}\n\n${interpretation.flags.length > 0 ? `Flags:\n${interpretation.flags.map(f => `• ${f}`).join('\n')}\n\n` : ''}${interpretation.strengths.length > 0 ? `Strengths:\n${interpretation.strengths.map(s => `• ${s}`).join('\n')}\n\n` : ''}`,
      timestamp: new Date().toISOString(), automated: true, internal: true,
    };
    const clientSms = {
      id: `m_${Date.now()}_rsc`, channel: 'sms', direction: 'outbound', status: 'sent',
      to: lead.phone, via: 'twilio',
      body: interpretation.recommendation === 'approve'
        ? `Haven: ${firstName}, your screening report looks great! I'll start submitting applications.`
        : interpretation.recommendation === 'conditional'
          ? `Haven: ${firstName}, got your report. A few items to discuss — I'll be in touch within 24hrs.`
          : `Haven: ${firstName}, got your report. Want to talk through a few things — calling you shortly.`,
      timestamp: new Date().toISOString(), automated: true,
    };
    const newTasks = interpretation.recommendation === 'flag'
      ? [{ id: `t_${Date.now()}`, title: `Review ${firstName}'s screening report`, dueDate: new Date().toISOString().split('T')[0], status: 'pending', auto: true, priority: 'high', flags: interpretation.flags }]
      : [];
    await updateLead(leadId, {
      screening: { status: 'completed', enteredAt: new Date().toISOString(), provider: 'RentSpree (manual entry)', report, interpretation },
      messages: [...(lead.messages || []), internalEmail, clientSms],
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'screening-logged', timestamp: new Date().toISOString(), message: `Screening logged — ${interpretation.summary}` }],
      tasks: [...(lead.tasks || []), ...newTasks],
    });
    showToast(`Screening logged · ${interpretation.recommendation}`);
  };

  const saveApplicationFile = async (leadId, fileData) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const application = {
      id: `app_${Date.now()}`,
      filename: fileData.filename,
      size: fileData.size,
      uploadedAt: new Date().toISOString(),
      dataUrl: fileData.dataUrl,
      notes: fileData.notes || '',
      reviewed: false,
    };
    await updateLead(leadId, {
      application,
      applicationStatus: 'submitted',
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'application-uploaded', timestamp: new Date().toISOString(), message: `Application PDF uploaded: ${fileData.filename}` }],
    });
    showToast('Application uploaded');
  };

  // Submissions: tracks an application → a specific landlord/property
  const createSubmission = async (leadId, submission) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const newSubmission = {
      id: `sub_${Date.now()}`,
      listing: submission.listing,
      landlordEmail: submission.landlordEmail,
      landlordName: submission.landlordName,
      emailSubject: submission.emailSubject,
      emailBody: submission.emailBody,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      notes: '',
      followUps: [],
    };
    // Auto-schedule a 3-day and 7-day follow-up reminder
    const reminder3 = new Date(Date.now() + 3 * 86400000);
    const reminder7 = new Date(Date.now() + 7 * 86400000);
    const firstName = lead.fullName.split(' ')[0];
    const newTasks = [
      { id: `t_${Date.now()}_3d`, title: `Follow up with ${submission.landlordName || 'landlord'} re: ${firstName}'s app (${submission.listing.address})`, dueDate: reminder3.toISOString().split('T')[0], status: 'pending', auto: true, priority: 'medium', relatedSubmissionId: newSubmission.id },
      { id: `t_${Date.now()}_7d`, title: `Second follow-up on ${firstName}'s app at ${submission.listing.address}`, dueDate: reminder7.toISOString().split('T')[0], status: 'pending', auto: true, priority: 'high', relatedSubmissionId: newSubmission.id },
    ];
    await updateLead(leadId, {
      submissions: [...(lead.submissions || []), newSubmission],
      stage: 'applied',
      tasks: [...(lead.tasks || []), ...newTasks],
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'submission-created', timestamp: new Date().toISOString(), message: `Application prepared for ${submission.listing.address} — email copied to clipboard` }],
    });
    showToast('Submission logged · follow-ups scheduled');
  };

  const updateSubmissionStatus = async (leadId, submissionId, newStatus) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const submissions = (lead.submissions || []).map(s =>
      s.id === submissionId ? { ...s, status: newStatus, statusUpdatedAt: new Date().toISOString() } : s
    );
    const sub = submissions.find(s => s.id === submissionId);
    // If approved/signed, close out related follow-up tasks
    let tasks = lead.tasks || [];
    if (['approved', 'denied', 'withdrawn', 'lease-signed'].includes(newStatus)) {
      tasks = tasks.map(t => t.relatedSubmissionId === submissionId ? { ...t, status: 'done', completedAt: new Date().toISOString() } : t);
    }
    // If lease signed, move lead to 'leased'
    const newStage = newStatus === 'lease-signed' ? 'leased' : lead.stage;
    await updateLead(leadId, {
      submissions,
      tasks,
      stage: newStage,
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'submission-status', timestamp: new Date().toISOString(), message: `${sub.listing.address}: status → ${newStatus}` }],
    });
    showToast(`Status updated: ${newStatus}`);
  };

  const logSubmissionFollowUp = async (leadId, submissionId, note) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const submissions = (lead.submissions || []).map(s => {
      if (s.id !== submissionId) return s;
      return { ...s, followUps: [...(s.followUps || []), { date: new Date().toISOString(), note }] };
    });
    const sub = submissions.find(s => s.id === submissionId);
    await updateLead(leadId, {
      submissions,
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'submission-followup', timestamp: new Date().toISOString(), message: `Followed up on ${sub.listing.address}: ${note.slice(0, 60)}${note.length > 60 ? '…' : ''}` }],
    });
    showToast('Follow-up logged');
  };

  const deleteApplicationFile = async (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    await updateLead(leadId, {
      application: null,
      applicationStatus: null,
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'application-removed', timestamp: new Date().toISOString(), message: `Application PDF removed` }],
    });
    showToast('Application removed');
  };

  const toggleApplicationReviewed = async (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || !lead.application) return;
    const newReviewed = !lead.application.reviewed;
    await updateLead(leadId, {
      application: { ...lead.application, reviewed: newReviewed, reviewedAt: newReviewed ? new Date().toISOString() : null },
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: newReviewed ? 'application-reviewed' : 'application-unreviewed', timestamp: new Date().toISOString(), message: newReviewed ? 'Application marked as reviewed' : 'Application unmarked as reviewed' }],
    });
    showToast(newReviewed ? 'Marked as reviewed' : 'Marked as unreviewed');
  };

  const addLead = async (lead) => {
    const bucket = classifyLead(lead);
    const id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const firstName = lead.fullName.split(' ')[0];
    const isSoon = bucket === 'GCMS' || bucket === 'BCMS';
    const createdAt = new Date().toISOString();

    const welcomeEmailSubject = 'Welcome to Rentals Philly';
    const welcomeEmailBody = isSoon
      ? `Hi ${firstName} — welcome to Rentals Philly! I've pulled together a curated list of rentals matching your criteria.`
      : `Hi ${firstName} — thanks for reaching out! Since your move-in date is further out, I'll follow up 75 days before.`;
    const welcomeSmsBody = isSoon
      ? `Rentals Philly: Welcome ${firstName}! Your matches are ready.`
      : `Rentals Philly: Thanks ${firstName}! I'll reach out 75 days before your move.`;

    // Email message inserted directly to DB below. SMS goes through sendSMS
    // (server wrapper) which inserts its own messages row — no duplicate.
    const welcomeEmailMsg = {
      id: `m_${Date.now()}_e`,
      lead_id: id,
      channel: 'email', direction: 'outbound', status: 'sent',
      to: lead.email, via: 'gmail',
      subject: welcomeEmailSubject, body: welcomeEmailBody,
      automated: true, internal: false,
    };

    const welcomeActivity = {
      id: `a_${Date.now()}`,
      lead_id: id,
      type: 'lead-created',
      message: `Lead created · ${bucket}`,
    };

    const tasks = [];
    if (bucket === 'GCM75+' || bucket === 'BC75+') {
      const followUpDate = new Date(lead.moveInDate);
      followUpDate.setDate(followUpDate.getDate() - 75);
      tasks.push({
        id: `t_${Date.now()}`,
        lead_id: id,
        title: `75-day outreach to ${firstName}`,
        due_date: followUpDate.toISOString().split('T')[0],
        status: 'pending',
        auto: true,
      });
    }

    try {
      const db = await import('@/lib/db');
      // Create lead row
      await db.createLead({
        id,
        full_name: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        move_in_date: lead.moveInDate,
        budget_min: Number(lead.budgetMin) || null,
        budget_max: Number(lead.budgetMax) || null,
        beds: lead.beds,
        baths: lead.baths,
        areas: lead.areas,
        employed: lead.employed,
        credit_score: lead.creditScore,
        tour_type: lead.tourType,
        bucket,
        stage: 'new',
      });
      // Insert welcome email message + activity + any tasks.
      // SMS row is inserted by the server wrapper (sendSMS) — do NOT also
      // insert it here or we'll get duplicates.
      await db.insertMessage(welcomeEmailMsg);
      await db.insertActivity(welcomeActivity);
      for (const t of tasks) await db.insertTask(t);
    } catch (e) {
      console.error('[app] Failed to create lead in Supabase', e);
    }

    // Fire real welcome email (existing path) + welcome SMS (server wrapper).
    sendEmail({ to: lead.email, subject: welcomeEmailSubject, body: welcomeEmailBody });
    const smsResult = await sendSMS({
      leadId: id,
      body: welcomeSmsBody,
      kind: 'welcome',
      idempotencyKey: `welcome-${id}`,
      automated: true,
    });

    // Build the in-memory lead object for immediate UI use (matches old shape)
    const newLead = {
      ...lead, id, bucket, stage: 'new',
      createdAt,
      tours: [], followUps: [],
      tasks: tasks.map(t => ({ id: t.id, title: t.title, dueDate: t.due_date, status: t.status, auto: t.auto })),
      activities: [{ id: welcomeActivity.id, type: welcomeActivity.type, message: welcomeActivity.message, timestamp: createdAt }],
      messages: [
        // Email — inserted optimistically as before.
        {
          id: welcomeEmailMsg.id, channel: 'email', direction: 'outbound', status: 'sent',
          to: welcomeEmailMsg.to, via: welcomeEmailMsg.via,
          subject: welcomeEmailMsg.subject, body: welcomeEmailMsg.body,
          automated: true, timestamp: createdAt,
        },
        // SMS — actual DB row returned by the server wrapper, if it succeeded.
        ...(smsResult?.ok && smsResult.message ? [{
          id: smsResult.message.id,
          channel: 'sms',
          direction: 'outbound',
          status: smsResult.message.status || 'sent',
          to: smsResult.message.to,
          via: 'twilio',
          subject: null,
          body: smsResult.message.body,
          automated: true,
          timestamp: smsResult.message.created_at || createdAt,
        }] : []),
      ],
    };

    setLeads([newLead, ...leads]);
    setCurrentLead(newLead);
    return newLead;
  };

  const requestVirtualTour = async (leadId, listings) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const firstName = lead.fullName.split(' ')[0];
    const virtualTour = {
      id: `tour_${Date.now()}`, type: 'virtual', tourType: 'virtual', listings,
      status: 'pending-videos', requestedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    };
    // Actually send the virtual-tour-request SMS via the server wrapper.
    const vtSmsBody = `Rentals Philly: Got your video tour request! Videos within 24 hrs.`;
    const vtEmailSubject = `Your virtual tour videos are on the way`;
    const vtEmailBody = `Hi ${firstName} — walkthrough videos for ${listings.length} properties within 24 hours.`;
    sendEmail({ to: lead.email, subject: vtEmailSubject, body: vtEmailBody });
    const vtSmsResult = await sendSMS({
      leadId,
      body: vtSmsBody,
      kind: 'virtual_tour',
      idempotencyKey: `vt-${virtualTour.id}`,
      automated: true,
    });

    await updateLead(leadId, {
      tours: [...(lead.tours || []), virtualTour],
      stage: 'tour-booked',
      messages: [...(lead.messages || []),
        { id: `m_${Date.now()}_e`, channel: 'email', direction: 'outbound', status: 'sent', to: lead.email, via: 'gmail', subject: vtEmailSubject, body: vtEmailBody, timestamp: new Date().toISOString(), automated: true },
        ...(vtSmsResult?.ok && vtSmsResult.message ? [{
          id: vtSmsResult.message.id, channel: 'sms', direction: 'outbound',
          status: vtSmsResult.message.status || 'sent',
          to: vtSmsResult.message.to, via: 'twilio',
          body: vtSmsResult.message.body,
          timestamp: vtSmsResult.message.created_at || new Date().toISOString(),
          automated: true,
        }] : []),
      ],
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'virtual-tour-requested', timestamp: new Date().toISOString(), message: `Virtual tour requested: ${listings.length} properties` }],
      tasks: [...(lead.tasks || []), { id: `t_${Date.now()}_v`, title: `Send video tour to ${firstName}`, dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], status: 'pending', auto: true, priority: 'high', relatedTourId: virtualTour.id }],
    });
  };

  const addTour = async (leadId, tour) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const newTour = { ...tour, id: `tour_${Date.now()}`, status: 'scheduled', tourType: 'in-person', createdAt: new Date().toISOString(), brightMLSStatus: 'pending' };
    const props = tour.listings || [];
    const firstName = lead.fullName.split(' ')[0];
    const startDT = parseSlotDateTime({ date: tour.date, time: tour.time });
    newTour.schedule = props.map((p, i) => {
      const propStart = new Date(startDT.getTime() + i * 45 * 60000);
      const propEnd = new Date(propStart.getTime() + 30 * 60000);
      const fmt = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return { ...p, startTime: fmt(propStart), endTime: fmt(propEnd), order: i + 1 };
    });
    // Actually send the tour-confirmation SMS via the server wrapper.
    const tourSmsBody = `Rentals Philly: Tour confirmed ${fmtDate(tour.date)} @ ${tour.time}.`;
    const tourEmailBody = `Hi ${firstName} — tour confirmed for ${fmtDate(tour.date)} starting at ${tour.time}.`;
    const tourEmailSubject = `Tour confirmed · ${fmtDate(tour.date)} at ${tour.time}`;
    sendEmail({ to: lead.email, subject: tourEmailSubject, body: tourEmailBody });
    const tourSmsResult = await sendSMS({
      leadId,
      body: tourSmsBody,
      kind: 'tour_confirmation',
      idempotencyKey: `tour-conf-${newTour.id}`,
      automated: true,
    });

    await updateLead(leadId, {
      tours: [...(lead.tours || []), newTour],
      stage: 'tour-booked',
      messages: [...(lead.messages || []),
        // Email — optimistic in-memory record. Email path isn't refactored yet.
        { id: `m_${Date.now()}_e`, channel: 'email', direction: 'outbound', status: 'sent', to: lead.email, via: 'gmail', subject: tourEmailSubject, body: tourEmailBody, timestamp: new Date().toISOString(), automated: true },
        // SMS — use the real DB row returned by the server wrapper, if any.
        ...(tourSmsResult?.ok && tourSmsResult.message ? [{
          id: tourSmsResult.message.id, channel: 'sms', direction: 'outbound',
          status: tourSmsResult.message.status || 'sent',
          to: tourSmsResult.message.to, via: 'twilio',
          body: tourSmsResult.message.body, timestamp: tourSmsResult.message.created_at || new Date().toISOString(),
          automated: true,
        }] : []),
      ],
      activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'tour-booked', timestamp: new Date().toISOString(), message: `Tour booked: ${props.length} properties for ${fmtDate(tour.date)}` }],
    });
    await saveSlots(slots.map(s => (s.date === tour.date && s.time === tour.time) ? { ...s, status: 'booked', bookedBy: leadId } : s));
  };

  if (!loaded) {
    return <div className="min-h-screen bg-white flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>;
  }

  return (
    <div className="min-h-screen bg-white font-sans antialiased text-slate-900" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" }}>
      <Nav view={view} setView={setView} />
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-full shadow-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}
      {view === 'landing' && <Landing onStart={() => setView('intake')} />}
      {view === 'intake' && <IntakeForm onSubmit={async (data) => { const l = await addLead(data); setView(l.bucket === 'GCMS' || l.bucket === 'BCMS' ? 'listings' : 'holding'); }} onBack={() => setView('landing')} />}
      {view === 'listings' && currentLead && <ListingsView lead={currentLead} onBookTour={(listings) => {
        setCurrentLead({ ...currentLead, _pendingListings: listings });
        if (currentLead.tourType === 'virtual') setView('virtual-request');
        else setView('booking');
      }} onDone={() => { setView('landing'); setCurrentLead(null); }} />}
      {view === 'virtual-request' && currentLead && <VirtualTourRequest lead={currentLead} listings={currentLead._pendingListings} onConfirm={async () => { await requestVirtualTour(currentLead.id, currentLead._pendingListings); setView('virtual-confirmed'); }} onBack={() => setView('listings')} />}
      {view === 'virtual-confirmed' && currentLead && <VirtualTourConfirmed lead={leads.find(l => l.id === currentLead.id) || currentLead} onDone={() => { setView('landing'); setCurrentLead(null); }} />}
      {view === 'booking' && currentLead && <BookingView lead={currentLead} listings={currentLead._pendingListings} slots={slots} onConfirm={async (slot) => { await addTour(currentLead.id, { listings: currentLead._pendingListings, date: slot.date, time: slot.time }); setView('booking-confirmed'); }} onJoinWaitlist={async (dates) => { await joinWaitlist(currentLead.id, dates); setView('waitlist-confirmed'); }} onBack={() => setView('listings')} />}
      {view === 'booking-confirmed' && currentLead && <BookingConfirmed lead={leads.find(l => l.id === currentLead.id) || currentLead} onDone={() => { setView('landing'); setCurrentLead(null); }} />}
      {view === 'waitlist-confirmed' && currentLead && <WaitlistConfirmed lead={currentLead} onDone={() => { setView('landing'); setCurrentLead(null); }} />}
      {view === 'holding' && currentLead && <HoldingPage lead={currentLead} onDone={() => { setView('landing'); setCurrentLead(null); }} />}
      {view === 'admin' && <AdminCRM leads={leads} updateLead={updateLead} saveLeads={saveLeads} slots={slots} openSlot={openSlot} closeSlot={closeSlot} waitlist={waitlist} saveWaitlist={saveWaitlist} settings={settings} saveSettings={saveSettings} subview={adminSubview} setSubview={setAdminSubview} selectedLeadId={selectedLeadId} setSelectedLeadId={setSelectedLeadId} showToast={showToast} timeOffset={timeOffset} saveTimeOffset={saveTimeOffset} saveScreeningReport={saveScreeningReport} saveApplicationFile={saveApplicationFile} deleteApplicationFile={deleteApplicationFile} toggleApplicationReviewed={toggleApplicationReviewed} createSubmission={createSubmission} updateSubmissionStatus={updateSubmissionStatus} logSubmissionFollowUp={logSubmissionFollowUp} />}
    </div>
  );
}

// ============================================================
// NAV
// ============================================================
function Nav({ view, setView }) {
  // Admin is NOT shown in the public nav. Access admin via the "/admin" route
  // or by pressing the secret keyboard shortcut (Cmd/Ctrl + Shift + A).
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setView('admin');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setView]);

  // Also check URL hash — if #admin is in URL, show admin
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#admin') {
      setView('admin');
    }
  }, [setView]);

  const isAdmin = view === 'admin';

  return (
    <nav className="border-b border-slate-200 sticky top-0 bg-white/90 backdrop-blur-md z-40">
      <div className="max-w-6xl mx-auto px-6 md:px-8 h-14 flex items-center justify-between">
        <button onClick={() => setView('landing')} className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center">
            <Home className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-slate-900 tracking-tight text-[15px]">
            {isAdmin ? 'Rentals Philly · Admin' : 'Rentals Philly'}
          </span>
        </button>
        {isAdmin ? (
          <button onClick={() => { setView('landing'); if (typeof window !== 'undefined') window.location.hash = ''; }} className="px-3 py-1.5 text-sm rounded-full text-slate-500 hover:text-slate-900 transition-colors">
            Exit admin
          </button>
        ) : (
          <button onClick={() => setView('landing')} className="px-3 py-1.5 text-sm rounded-full text-slate-900 font-medium">Find a home</button>
        )}
      </div>
    </nav>
  );
}

// ============================================================
// LANDING
// ============================================================
function Landing({ onStart }) {
  return (
    <div>
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="pt-24 md:pt-32 pb-20 md:pb-24">
          <div className="max-w-3xl">
            <Pill icon={Sparkles} className="mb-8">Philadelphia rentals</Pill>
            <h1 className="text-5xl md:text-7xl font-semibold text-slate-900 tracking-[-0.03em] leading-[1.02] mb-6">
              Your next home,<br />without the noise.
            </h1>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 max-w-xl">
              Tell us what you're looking for. We'll hand-match you with rentals that actually fit — and handle the tours, paperwork, and everything in between.
            </p>
            <Button size="xl" iconRight={ArrowRight} onClick={onStart}>Start your search</Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-8 py-20 md:py-24">
        <div className="mb-12 max-w-2xl">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">How it works</div>
          <h2 className="text-3xl md:text-5xl font-semibold text-slate-900 tracking-tight leading-[1.1]">Three steps from searching to moving in.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: FileText, title: 'Tell us your story', desc: 'A short form — budget, timeline, must-haves. Takes 2 minutes.' },
            { icon: Building2, title: 'See curated listings', desc: 'Only homes that fit your criteria. Select up to 5 to tour in one outing.' },
            { icon: Calendar, title: 'Tour, apply, move in', desc: 'We coordinate tours, handle the leasing office, and guide you through the application.' },
          ].map((f, i) => (
            <Card key={i} className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <f.icon className="w-4 h-4" />
                </div>
                <div className="text-xs font-semibold text-slate-400 tracking-wider">STEP {i + 1}</div>
              </div>
              <div className="font-semibold text-slate-900 mb-2 text-lg">{f.title}</div>
              <div className="text-[15px] text-slate-600 leading-relaxed">{f.desc}</div>
            </Card>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-6 md:px-8 py-20 md:py-24 text-center">
          <h2 className="text-3xl md:text-5xl font-semibold text-slate-900 tracking-tight leading-[1.1] mb-6">Ready when you are.</h2>
          <p className="text-lg text-slate-600 mb-10 max-w-xl mx-auto">Two-minute form. Hand-matched listings. A realtor in your corner from search to signed lease.</p>
          <Button size="xl" iconRight={ArrowRight} onClick={onStart}>Start your search</Button>
        </div>
      </div>

      <div className="border-t border-slate-200 py-8">
        <div className="max-w-6xl mx-auto px-6 md:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-slate-900 flex items-center justify-center">
              <Home className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="font-semibold text-slate-900 text-sm">Rentals Philly</span>
          </div>
          <div className="text-xs text-slate-400">© {new Date().getFullYear()} Rentals Philly</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// INTAKE FORM
// ============================================================
function IntakeForm({ onSubmit, onBack }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    fullName: '', email: '', phone: '',
    moveInDate: '', budgetMin: '', budgetMax: '',
    beds: '', baths: '', areas: '',
    employed: '', creditScore: '', tourType: '',
  });
  const update = (k, v) => setData({ ...data, [k]: v });

  const steps = [
    {
      title: 'Let\'s start with the basics',
      subtitle: 'How can we reach you?',
      valid: () => data.fullName.trim() && /.+@.+\..+/.test(data.email) && data.phone.trim().length >= 7,
      fields: (
        <div className="space-y-4">
          <FormField label="Full name" icon={User}><input value={data.fullName} onChange={e => update('fullName', e.target.value)} placeholder="Alex Morgan" className="form-input" /></FormField>
          <FormField label="Email" icon={Mail}><input type="email" value={data.email} onChange={e => update('email', e.target.value)} placeholder="alex@example.com" className="form-input" /></FormField>
          <FormField label="Phone" icon={Phone}><input type="tel" value={data.phone} onChange={e => update('phone', e.target.value)} placeholder="(215) 555-0123" className="form-input" /></FormField>
        </div>
      )
    },
    {
      title: 'When are you moving?',
      subtitle: 'We\'ll tailor our search to your timeline.',
      valid: () => !!data.moveInDate,
      fields: <DatePicker value={data.moveInDate} onChange={(v) => update('moveInDate', v)} />
    },
    {
      title: 'What\'s your budget?',
      subtitle: 'Monthly rent range.',
      valid: () => data.budgetMin && data.budgetMax && Number(data.budgetMax) >= Number(data.budgetMin),
      fields: (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Min" icon={DollarSign}><input type="number" value={data.budgetMin} onChange={e => update('budgetMin', e.target.value)} placeholder="1500" className="form-input" /></FormField>
          <FormField label="Max" icon={DollarSign}><input type="number" value={data.budgetMax} onChange={e => update('budgetMax', e.target.value)} placeholder="2800" className="form-input" /></FormField>
        </div>
      )
    },
    {
      title: 'How much space do you need?',
      subtitle: 'Pick the minimum you\'d consider.',
      valid: () => data.beds !== '' && data.baths !== '',
      fields: <BedBathSelector beds={data.beds} baths={data.baths} onBedsChange={(v) => update('beds', v)} onBathsChange={(v) => update('baths', v)} />
    },
    {
      title: 'Where do you want to live?',
      subtitle: 'Neighborhoods or zip codes — comma separated.',
      valid: () => true,
      fields: <FormField label="Preferred areas" icon={MapPin}><input value={data.areas} onChange={e => update('areas', e.target.value)} placeholder="Rittenhouse, Fishtown, 19147" className="form-input" /></FormField>
    },
    {
      title: 'A few financial details',
      subtitle: 'This helps us match you with the right properties.',
      valid: () => data.employed && data.creditScore,
      fields: (
        <div className="space-y-5">
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Currently employed?</div>
            <div className="grid grid-cols-2 gap-2">
              {['Yes', 'No'].map(v => (
                <ChoiceButton key={v} selected={data.employed === v} onClick={() => update('employed', v)}>{v}</ChoiceButton>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Credit score range</div>
            <div className="grid grid-cols-2 gap-2">
              {['Below 600', '600-649', '650-699', '700-749', '750+'].map(v => (
                <ChoiceButton key={v} selected={data.creditScore === v} onClick={() => update('creditScore', v)}>{v}</ChoiceButton>
              ))}
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'How would you like to tour?',
      subtitle: 'Pick what works best for you.',
      valid: () => !!data.tourType,
      fields: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { v: 'in-person', icon: Users, title: 'In-person', desc: 'Walk through properties with your agent.' },
            { v: 'virtual', icon: Video, title: 'Virtual', desc: 'Video walkthrough — great if relocating.' },
          ].map(o => (
            <button key={o.v} type="button" onClick={() => update('tourType', o.v)} className={`p-5 rounded-2xl border-2 text-left transition-colors ${data.tourType === o.v ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-3"><o.icon className="w-4 h-4" /></div>
              <div className="font-semibold text-slate-900 mb-1">{o.title}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{o.desc}</div>
            </button>
          ))}
        </div>
      )
    },
  ];

  const s = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div className="max-w-xl mx-auto px-6 md:px-8 pt-10 pb-24">
      <style>{`.form-input { width: 100%; padding: 0.75rem 1rem; border: 1.5px solid rgb(226 232 240); border-radius: 0.75rem; font-size: 0.95rem; outline: none; transition: all 0.15s; background: white; } .form-input:focus { border-color: rgb(15 23 42); box-shadow: 0 0 0 3px rgba(15,23,42,0.06); }`}</style>
      <div className="mb-10">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={step === 0 ? onBack : () => setStep(step - 1)} className="mb-6 -ml-2">Back</Button>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-900 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-slate-400 font-medium tabular-nums">{step + 1} / {steps.length}</div>
        </div>
      </div>
      <div className="mb-8">
        <h2 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-[-0.02em] leading-[1.1] mb-3">{s.title}</h2>
        <p className="text-slate-600">{s.subtitle}</p>
      </div>
      <div className="mb-10">{s.fields}</div>
      <button
        onClick={() => { if (!s.valid()) return; if (step === steps.length - 1) onSubmit(data); else setStep(step + 1); }}
        disabled={!s.valid()}
        className="w-full bg-slate-900 text-white py-3.5 rounded-full font-medium hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {step === steps.length - 1 ? 'See my matches' : 'Continue'}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================
// DATE PICKER — custom month calendar
// ============================================================
function DatePicker({ value, onChange }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return new Date(value + 'T00:00:00');
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const selectedDate = value ? new Date(value + 'T00:00:00') : null;

  // Build calendar grid — weeks of 7 days
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastOfMonth.getDate();
  const startPad = firstOfMonth.getDay(); // 0 = Sunday

  const weeks = [];
  let currentWeek = new Array(startPad).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  // Don't allow navigating to months fully in the past
  const isPrevDisabled = year === today.getFullYear() && month === today.getMonth();
  // Limit to ~18 months ahead
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 18, 1);
  const isNextDisabled = viewMonth >= maxMonth;

  const selectDay = (day) => {
    if (!day) return;
    const d = new Date(year, month, day);
    if (d < today) return;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(iso);
  };

  const monthName = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Quick shortcuts
  const setQuick = (months) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + months);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(iso);
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  return (
    <div>
      {/* Quick shortcut chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { label: 'ASAP', months: 0 },
          { label: '1 month', months: 1 },
          { label: '2 months', months: 2 },
          { label: '3 months', months: 3 },
          { label: '6 months', months: 6 },
        ].map(s => (
          <button
            key={s.label}
            type="button"
            onClick={() => setQuick(s.months)}
            className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <button
            type="button"
            onClick={prevMonth}
            disabled={isPrevDisabled}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="font-semibold text-slate-900">{monthName}</div>
          <button
            type="button"
            onClick={nextMonth}
            disabled={isNextDisabled}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 px-3 pt-3">
          {dayLabels.map((l, i) => (
            <div key={i} className="text-center text-xs font-medium text-slate-400 py-1">{l}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 px-3 pb-3">
          {weeks.flat().map((day, i) => {
            if (!day) return <div key={i} className="aspect-square" />;
            const d = new Date(year, month, day);
            const isPast = d < today;
            const isToday = d.getTime() === today.getTime();
            const isSelected = selectedDate && d.getTime() === selectedDate.getTime();
            return (
              <button
                key={i}
                type="button"
                onClick={() => selectDay(day)}
                disabled={isPast}
                className={`aspect-square flex items-center justify-center text-sm rounded-full m-0.5 transition-colors ${
                  isSelected
                    ? 'bg-slate-900 text-white font-semibold'
                    : isPast
                      ? 'text-slate-300 cursor-not-allowed'
                      : isToday
                        ? 'text-slate-900 font-semibold ring-1 ring-slate-200 hover:bg-slate-100'
                        : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {value && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <Calendar className="w-4 h-4 text-slate-400" />
          Selected: <span className="font-semibold">{new Date(value + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BED / BATH SELECTOR — Zillow-style button groups
// ============================================================
function BedBathSelector({ beds, baths, onBedsChange, onBathsChange }) {
  const bedOptions = [
    { value: '0', label: 'Studio' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4+' },
  ];
  const bathOptions = [
    { value: '1', label: '1' },
    { value: '1.5', label: '1.5' },
    { value: '2', label: '2' },
    { value: '2.5', label: '2.5' },
    { value: '3', label: '3+' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bed className="w-4 h-4 text-slate-400" />
          <div className="text-sm font-medium text-slate-700">Bedrooms</div>
          <div className="text-xs text-slate-400 ml-auto">Minimum</div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {bedOptions.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => onBedsChange(o.value)}
              className={`py-3 rounded-xl text-sm font-medium transition-colors border-2 ${
                beds === o.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bath className="w-4 h-4 text-slate-400" />
          <div className="text-sm font-medium text-slate-700">Bathrooms</div>
          <div className="text-xs text-slate-400 ml-auto">Minimum</div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {bathOptions.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => onBathsChange(o.value)}
              className={`py-3 rounded-xl text-sm font-medium transition-colors border-2 ${
                baths === o.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}{label}
      </label>
      {children}
    </div>
  );
}

function ChoiceButton({ selected, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`py-2.5 px-3 rounded-xl border-2 font-medium text-sm transition-colors ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:border-slate-300'}`}>{children}</button>
  );
}

// ============================================================
// LISTINGS (client flow)
// ============================================================
const MAX_PROPERTIES_PER_TOUR = 5;

function ListingsView({ lead, onBookTour, onDone }) {
  const matches = matchListings(lead).slice(0, MAX_PROPERTIES_PER_TOUR);
  const [selected, setSelected] = useState([]);
  const firstName = lead.fullName.split(' ')[0];

  const toggle = (listing) => {
    if (selected.find(s => s.id === listing.id)) setSelected(selected.filter(s => s.id !== listing.id));
    else if (selected.length < MAX_PROPERTIES_PER_TOUR) setSelected([...selected, listing]);
  };
  const atLimit = selected.length >= MAX_PROPERTIES_PER_TOUR;

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-12 md:py-16 pb-32">
      <div className="mb-10">
        <Pill tone="positive" icon={CheckCircle2} className="mb-6">Profile created</Pill>
        <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-[-0.02em] leading-[1.1] mb-4">
          Hi {firstName} — here are your matches.
        </h1>
        <p className="text-slate-600 max-w-xl leading-relaxed">
          {matches.length > 0 ? `${matches.length} hand-picked ${matches.length === 1 ? 'home' : 'homes'}. Select up to ${MAX_PROPERTIES_PER_TOUR} you'd like to tour.` : 'No matches yet. We\'ll reach out shortly.'}
        </p>
      </div>

      {matches.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map(l => {
            const isSelected = !!selected.find(s => s.id === l.id);
            const disabled = !isSelected && atLimit;
            return (
              <div key={l.id} onClick={() => !disabled && toggle(l)} className={`group rounded-2xl overflow-hidden border transition-all cursor-pointer relative bg-white ${isSelected ? 'border-slate-900 shadow-md ring-2 ring-slate-900' : disabled ? 'border-slate-200 opacity-40 cursor-not-allowed' : 'border-slate-200 hover:shadow-md hover:border-slate-300'}`}>
                {isSelected && <div className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg"><Check className="w-4 h-4" strokeWidth={3} /></div>}
                <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                  <img src={l.image} alt={l.address} className="w-full h-full object-cover" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-slate-900 truncate">{l.address}</div>
                      <div className="text-sm text-slate-500 mt-0.5">{l.neighborhood}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-slate-900">{fmtCurrency(l.price)}</div>
                      <div className="text-xs text-slate-500">/mo</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5"><Bed className="w-3.5 h-3.5" /> {l.beds === 0 ? 'Studio' : `${l.beds}bd`}</span>
                    <span className="flex items-center gap-1.5"><Bath className="w-3.5 h-3.5" /> {l.baths}ba</span>
                    <span>{l.sqft} sqft</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {matches.length > 0 && (
        <div className="mt-10 text-center">
          <Button variant="ghost" onClick={onDone}>Done for now</Button>
        </div>
      )}

      {selected.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] z-40">
          <div className="max-w-6xl mx-auto px-6 md:px-8 py-3.5 flex items-center gap-4">
            <div className="flex -space-x-2">
              {selected.slice(0, 4).map(s => <img key={s.id} src={s.image} alt="" className="w-9 h-9 rounded-full border-2 border-white object-cover" />)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 text-sm">{selected.length} {selected.length === 1 ? 'property' : 'properties'} selected</div>
            </div>
            <Button iconRight={ArrowRight} onClick={() => onBookTour(selected)}>Book tour</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BOOKING
// ============================================================
function BookingView({ lead, listings, slots, onConfirm, onJoinWaitlist, onBack }) {
  const [selected, setSelected] = useState(null);
  const [waitlistMode, setWaitlistMode] = useState(false);
  const [waitlistDates, setWaitlistDates] = useState([]);

  const bookableSlots = slots.filter(slotIsBookable).sort((a, b) => parseSlotDateTime(a) - parseSlotDateTime(b));
  const grouped = bookableSlots.reduce((acc, s) => { (acc[s.date] = acc[s.date] || []).push(s); return acc; }, {});

  const allWindowDates = useMemo(() => {
    const out = [];
    const start = new Date(Date.now() + TOUR_WINDOW.minHoursAhead * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i <= TOUR_WINDOW.maxDaysAhead; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d.toISOString().split('T')[0]);
    }
    return out;
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-8 py-10">
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} className="mb-6 -ml-2">Back to listings</Button>

      <div className="mb-8">
        <SectionHeader>Your route · {listings.length} {listings.length === 1 ? 'property' : 'properties'}</SectionHeader>
        <div className="space-y-2">
          {listings.map((listing, i) => (
            <div key={listing.id} className="flex gap-3 p-3 rounded-xl border border-slate-200">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0 mt-1">{i + 1}</div>
              <img src={listing.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-900 truncate">{listing.address}</div>
                <div className="text-xs text-slate-500">{listing.neighborhood} · {fmtCurrency(listing.price)}/mo</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!waitlistMode && (
        <>
          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Pick a start time</h2>
          <p className="text-slate-500 text-sm mb-6">Tours booked 48+ hours out, within the next {TOUR_WINDOW.maxDaysAhead} days.</p>
          {bookableSlots.length > 0 ? (
            <div className="space-y-5 mb-6">
              {Object.entries(grouped).map(([date, times]) => (
                <div key={date}>
                  <div className="text-sm font-medium text-slate-700 mb-2">{fmtDate(date)}</div>
                  <div className="flex flex-wrap gap-2">
                    {times.map(s => (
                      <button key={s.id} onClick={() => setSelected(s)} className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors ${selected?.id === s.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:border-slate-300'}`}>{s.time}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Hourglass} title="No open slots right now" desc="Join the waitlist and we'll notify you the moment one opens." />
          )}
          <div className="flex gap-3">
            <button onClick={() => selected && onConfirm(selected)} disabled={!selected} className="flex-1 bg-slate-900 text-white py-3.5 rounded-full font-medium hover:bg-slate-800 disabled:opacity-30 transition-colors">
              {selected ? `Confirm ${fmtDate(selected.date)} · ${selected.time}` : 'Select a time'}
            </button>
            <Button variant="outline" size="lg" onClick={() => setWaitlistMode(true)}>Join waitlist</Button>
          </div>
        </>
      )}

      {waitlistMode && (
        <>
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setWaitlistMode(false)} className="mb-4 -ml-2">Back to available times</Button>
          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Pick dates that work</h2>
          <p className="text-slate-500 text-sm mb-6">We'll notify you the moment a slot opens.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
            {allWindowDates.map(d => {
              const isSelected = waitlistDates.includes(d);
              return (
                <button key={d} onClick={() => isSelected ? setWaitlistDates(waitlistDates.filter(x => x !== d)) : setWaitlistDates([...waitlistDates, d])} className={`px-3 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${isSelected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:border-slate-300'}`}>
                  {fmtDate(d)}
                </button>
              );
            })}
          </div>
          <button onClick={() => waitlistDates.length > 0 && onJoinWaitlist(waitlistDates)} disabled={waitlistDates.length === 0} className="w-full bg-slate-900 text-white py-3.5 rounded-full font-medium hover:bg-slate-800 disabled:opacity-30 transition-colors">
            Join waitlist for {waitlistDates.length} {waitlistDates.length === 1 ? 'date' : 'dates'}
          </button>
        </>
      )}
    </div>
  );
}

function WaitlistConfirmed({ lead, onDone }) {
  return (
    <div className="max-w-xl mx-auto px-6 md:px-8 py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-6"><Hourglass className="w-6 h-6" /></div>
      <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-3">You're on the list, {lead.fullName.split(' ')[0]}.</h1>
      <p className="text-slate-500 mb-8 leading-relaxed">We'll notify you the moment a slot opens.</p>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}

function VirtualTourRequest({ lead, listings, onConfirm, onBack }) {
  return (
    <div className="max-w-2xl mx-auto px-6 md:px-8 py-12">
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} className="mb-6 -ml-2">Back</Button>
      <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-3">Videos coming your way, {lead.fullName.split(' ')[0]}.</h1>
      <p className="text-slate-600 leading-relaxed mb-8">Walkthrough videos for {listings.length} properties within 24 hours.</p>
      <button onClick={onConfirm} className="w-full bg-slate-900 text-white py-3.5 rounded-full font-medium hover:bg-slate-800 transition-colors">Request videos</button>
    </div>
  );
}

function VirtualTourConfirmed({ lead, onDone }) {
  return (
    <div className="max-w-xl mx-auto px-6 md:px-8 py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center mx-auto mb-6"><Video className="w-6 h-6" /></div>
      <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">Request received.</h1>
      <p className="text-slate-600 mb-8">Videos will be texted to {lead.phone} within 24 hours.</p>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}

function BookingConfirmed({ lead, onDone }) {
  const lastTour = (lead.tours || [])[(lead.tours || []).length - 1];
  return (
    <div className="max-w-xl mx-auto px-6 md:px-8 py-16">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6"><Check className="w-6 h-6" strokeWidth={2.5} /></div>
        <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-3">Tour confirmed</h1>
        <p className="text-slate-500">Confirmation sent to {lead.email}.</p>
      </div>
      {lastTour && (
        <Card className="p-5 mb-6">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-medium">{fmtDate(lastTour.date)} · starting {lastTour.time}</span>
          </div>
        </Card>
      )}
      <div className="flex justify-center"><Button onClick={onDone}>Done</Button></div>
    </div>
  );
}

function HoldingPage({ lead, onDone }) {
  const moveDate = new Date(lead.moveInDate);
  const followUpDate = new Date(moveDate);
  followUpDate.setDate(followUpDate.getDate() - 75);
  return (
    <div className="max-w-xl mx-auto px-6 md:px-8 py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-6"><Clock className="w-6 h-6" /></div>
      <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">Hi {lead.fullName.split(' ')[0]} — we've got you.</h1>
      <p className="text-slate-600 leading-relaxed mb-8">We'll reach out <span className="text-slate-900 font-medium">75 days before</span> your move-in date.</p>
      <Card className="p-4 mb-8 text-left">
        <div className="flex items-center gap-3">
          <Bell className="w-4 h-4 text-slate-400" />
          <div>
            <div className="text-xs text-slate-500">We'll be in touch on</div>
            <div className="font-semibold text-slate-900 text-sm">{followUpDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>
      </Card>
      <Button onClick={onDone}>Back to home</Button>
    </div>
  );
}

// ============================================================
// ADMIN CRM
// ============================================================
const PIPELINE_STAGES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'tour-booked', label: 'Touring' },
  { id: 'post-tour', label: 'Post-tour' },
  { id: 'applied', label: 'Applied' },
  { id: 'leased', label: 'Leased' },
  { id: 'lost', label: 'Lost' },
];

const MESSAGE_TEMPLATES = {
  'check-in': { name: 'Check-in', subject: 'Quick check-in', body: 'Hi {firstName} — just checking in on your home search. Still looking in {areas}?' },
  'custom': { name: 'Custom message', subject: '', body: '' },
};

function AdminCRM({ leads, updateLead, saveLeads, slots, openSlot, closeSlot, waitlist, saveWaitlist, settings, saveSettings, subview, setSubview, selectedLeadId, setSelectedLeadId, showToast, timeOffset, saveTimeOffset, saveScreeningReport, saveApplicationFile, deleteApplicationFile, toggleApplicationReviewed, createSubmission, updateSubmissionStatus, logSubmissionFollowUp }) {
  const [composeModal, setComposeModal] = useState(null);
  const [screeningModal, setScreeningModal] = useState(null);
  const [submitModal, setSubmitModal] = useState(null);
  const [followUpModal, setFollowUpModal] = useState(null);
  const [search, setSearch] = useState('');

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  const allTasks = useMemo(() => {
    return leads.flatMap(l => (l.tasks || []).map(t => ({ ...t, lead: l })))
      .filter(t => t.status === 'pending')
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [leads]);

  const overdueTasks = allTasks.filter(t => new Date(t.dueDate + 'T23:59:59') < new Date());
  const todayTasks = allTasks.filter(t => new Date(t.dueDate + 'T00:00:00').toDateString() === new Date().toDateString());
  const flagCount = overdueTasks.length + todayTasks.length;

  const upcomingTours = useMemo(() => {
    return leads.flatMap(l => (l.tours || []).filter(t => t.status === 'scheduled').map(t => ({ ...t, lead: l })))
      .sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'));
  }, [leads]);

  const recentActivity = useMemo(() => {
    return leads.flatMap(l => (l.activities || []).map(a => ({ ...a, lead: l })))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 15);
  }, [leads]);

  const metrics = useMemo(() => {
    const total = leads.length;
    const activeTours = leads.flatMap(l => l.tours || []).filter(t => t.status === 'scheduled').length;
    const leased = leads.filter(l => l.stage === 'leased').length;
    const conversionRate = total > 0 ? Math.round((leased / total) * 100) : 0;
    return { total, activeTours, leased, conversionRate };
  }, [leads]);

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-8 py-8">
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">CRM</h1>
          <p className="text-sm text-slate-500 mt-1">Every lead, every touchpoint, automated.</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className="pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-full focus:outline-none focus:border-slate-400 w-56" />
        </div>
      </div>

      <div className="flex gap-0.5 mb-8 border-b border-slate-200 overflow-x-auto">
        {[
          { k: 'dashboard', label: 'Today', icon: Zap },
          { k: 'leads', label: 'Leads', icon: Users, count: leads.length },
          { k: 'inbox', label: 'Inbox', icon: Inbox },
          { k: 'tours', label: 'Tours', icon: CalendarDays, count: upcomingTours.length },
          { k: 'submissions', label: 'Applications', icon: FileCheck },
          { k: 'blast', label: 'Bulk SMS', icon: Send },
          { k: 'flags', label: 'Tasks', icon: Flag, urgent: flagCount || null },
          { k: 'settings', label: 'Settings', icon: Settings },
        ].map(t => (
          <button key={t.k} onClick={() => setSubview(t.k)} className={`px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px ${subview === t.k ? 'text-slate-900 border-slate-900' : 'text-slate-500 border-transparent hover:text-slate-900'}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.urgent ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500 text-white">{t.urgent}</span> : t.count > 0 ? <span className="text-[10px] text-slate-400">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {subview === 'dashboard' && <DashboardView metrics={metrics} leads={leads} recentActivity={recentActivity} upcomingTours={upcomingTours} overdueTasks={overdueTasks} todayTasks={todayTasks} onSelectLead={setSelectedLeadId} settings={settings} saveSettings={saveSettings} />}
      {subview === 'leads' && <LeadsListView leads={leads} search={search} onSelectLead={setSelectedLeadId} saveLeads={saveLeads} waitlist={waitlist} />}
      {subview === 'inbox' && <InboxView leads={leads} onSelectLead={setSelectedLeadId} />}
      {subview === 'submissions' && <SubmissionsView leads={leads} onSelectLead={setSelectedLeadId} updateSubmissionStatus={updateSubmissionStatus} />}
      {subview === 'blast' && <BlastView leads={leads} showToast={showToast} />}
      {subview === 'flags' && <FlagsView allTasks={allTasks} updateLead={updateLead} onSelectLead={setSelectedLeadId} showToast={showToast} />}
      {subview === 'tours' && <ToursView upcomingTours={upcomingTours} onSelectLead={setSelectedLeadId} />}
      {subview === 'settings' && <SettingsView settings={settings} saveSettings={saveSettings} showToast={showToast} timeOffset={timeOffset} saveTimeOffset={saveTimeOffset} />}

      {selectedLead && <LeadDetailCRM lead={selectedLead} onClose={() => setSelectedLeadId(null)} updateLead={updateLead} onCompose={(template) => setComposeModal({ lead: selectedLead, template })} showToast={showToast} onOpenScreening={() => setScreeningModal({ lead: selectedLead })} onOpenSubmit={() => setSubmitModal({ lead: selectedLead })} onOpenFollowUp={(submissionId) => setFollowUpModal({ lead: selectedLead, submissionId })} settings={settings} saveApplicationFile={saveApplicationFile} deleteApplicationFile={deleteApplicationFile} toggleApplicationReviewed={toggleApplicationReviewed} updateSubmissionStatus={updateSubmissionStatus} />}

      {screeningModal && <ScreeningPasteModal lead={screeningModal.lead} onClose={() => setScreeningModal(null)} onSave={async (reportInput) => { await saveScreeningReport(screeningModal.lead.id, reportInput); setScreeningModal(null); }} settings={settings} />}

      {submitModal && <SubmitApplicationModal lead={submitModal.lead} onClose={() => setSubmitModal(null)} onSubmit={async (submission) => { await createSubmission(submitModal.lead.id, submission); setSubmitModal(null); }} settings={settings} />}

      {followUpModal && <LogFollowUpModal lead={followUpModal.lead} submissionId={followUpModal.submissionId} onClose={() => setFollowUpModal(null)} onLog={async (note) => { await logSubmissionFollowUp(followUpModal.lead.id, followUpModal.submissionId, note); setFollowUpModal(null); }} />}

      {composeModal && <ComposeModal {...composeModal} onClose={() => setComposeModal(null)} onSend={async (msg) => {
        const lead = composeModal.lead;
        let newMsg;
        if (msg.channel === 'sms') {
          // Actually send via the server wrapper.
          const result = await sendSMS({
            leadId: lead.id,
            body: msg.body,
            kind: 'manual',
            idempotencyKey: `manual-${lead.id}-${Date.now()}`,
            automated: false,
          });
          if (!result.ok) {
            const reason =
              result.error === 'opted_out' ? 'lead has opted out of SMS' :
              result.error === 'invalid_phone' ? 'invalid phone number' :
              result.error || 'send failed';
            showToast(`SMS not sent — ${reason}`);
            setComposeModal(null);
            return;
          }
          // Pull the real DB row into the in-memory lead so the UI matches.
          newMsg = {
            id: result.message.id,
            channel: 'sms',
            direction: 'outbound',
            status: result.message.status || 'sent',
            to: result.message.to,
            via: 'twilio',
            subject: null,
            body: result.message.body,
            timestamp: result.message.created_at || new Date().toISOString(),
            automated: false,
          };
        } else {
          // Email path unchanged for now — calls send-email API as a side effect,
          // optimistic in-memory message stays as before.
          sendEmail({ to: lead.email, subject: msg.subject, body: msg.body });
          newMsg = {
            id: `m_${Date.now()}`, channel: 'email', direction: 'outbound', status: 'sent',
            to: lead.email, via: 'gmail',
            subject: msg.subject, body: msg.body, timestamp: new Date().toISOString(),
          };
        }
        updateLead(lead.id, {
          messages: [...(lead.messages || []), newMsg],
          activities: [...(lead.activities || []), { id: `a_${Date.now()}`, type: 'message-sent', timestamp: new Date().toISOString(), message: `${msg.channel === 'sms' ? 'SMS' : 'Email'} sent` }],
        });
        showToast(`${msg.channel === 'sms' ? 'SMS' : 'Email'} sent`);
        setComposeModal(null);
      }} />}
    </div>
  );
}

// ============================================================
// DASHBOARD — Today's focus
// ============================================================
function DashboardView({ metrics, leads, recentActivity, upcomingTours, overdueTasks, todayTasks, onSelectLead, settings, saveSettings }) {
  const automationOn = settings.automation?.enabled !== false;
  const todayStr = new Date().toISOString().split('T')[0];

  // Build the "Today's focus" feed — prioritized list of action items
  const focusItems = useMemo(() => {
    const items = [];

    // 1. Tours happening today
    leads.forEach(lead => {
      (lead.tours || []).forEach(tour => {
        if (tour.status === 'scheduled' && tour.date === todayStr) {
          items.push({
            id: `tour_${tour.id}`,
            priority: 1,
            icon: Calendar,
            tone: 'info',
            label: 'Tour today',
            title: `${lead.fullName} · ${tour.time}`,
            sub: `${(tour.listings || []).length} ${(tour.listings || []).length === 1 ? 'property' : 'properties'}${tour.tourType === 'virtual' ? ' · virtual' : ''}`,
            leadId: lead.id,
          });
        }
      });
    });

    // 2. Flagged screening reports
    leads.forEach(lead => {
      if (lead.screening?.interpretation?.recommendation === 'flag') {
        const reviewed = (lead.tasks || []).find(t => t.status === 'pending' && t.title.toLowerCase().includes('screening'));
        if (reviewed) {
          items.push({
            id: `screening_${lead.id}`,
            priority: 2,
            icon: AlertTriangle,
            tone: 'danger',
            label: 'Review screening',
            title: lead.fullName,
            sub: lead.screening.interpretation.summary,
            leadId: lead.id,
          });
        }
      }
    });

    // 3. Apps uploaded but not submitted to any landlord
    leads.forEach(lead => {
      if (lead.application && !lead.application.reviewed) {
        items.push({
          id: `app_review_${lead.id}`,
          priority: 3,
          icon: FileCheck,
          tone: 'warning',
          label: 'Review application',
          title: lead.fullName,
          sub: lead.application.filename,
          leadId: lead.id,
        });
      }
      if (lead.application && lead.application.reviewed && (!lead.submissions || lead.submissions.length === 0)) {
        items.push({
          id: `app_submit_${lead.id}`,
          priority: 3,
          icon: Send,
          tone: 'accent',
          label: 'Submit to landlord',
          title: lead.fullName,
          sub: `App ready · not yet submitted`,
          leadId: lead.id,
        });
      }
    });

    // 4. Submissions stuck in "submitted" for 3+ days (waiting on landlord)
    leads.forEach(lead => {
      (lead.submissions || []).forEach(sub => {
        if (sub.status !== 'submitted') return;
        const daysSince = (Date.now() - new Date(sub.submittedAt).getTime()) / 86400000;
        if (daysSince >= 3) {
          items.push({
            id: `sub_followup_${sub.id}`,
            priority: daysSince >= 7 ? 2 : 4,
            icon: PhoneCall,
            tone: daysSince >= 7 ? 'danger' : 'warning',
            label: daysSince >= 7 ? 'No response in 7+ days' : 'Follow up on submission',
            title: `${lead.fullName} → ${sub.listing.address}`,
            sub: `${Math.floor(daysSince)} days since submission`,
            leadId: lead.id,
          });
        }
      });
    });

    // 5. Inbound messages not yet responded to (simulated — in prod, use read receipts)
    leads.forEach(lead => {
      const msgs = lead.messages || [];
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.direction === 'inbound') {
        items.push({
          id: `reply_${lead.id}`,
          priority: 2,
          icon: MessageSquare,
          tone: 'info',
          label: 'New reply',
          title: lead.fullName,
          sub: lastMsg.body?.slice(0, 60) || 'New message',
          leadId: lead.id,
        });
      }
    });

    // 6. Tasks due today
    todayTasks.forEach(t => {
      items.push({
        id: `task_${t.id}`,
        priority: t.priority === 'high' ? 2 : 4,
        icon: Flag,
        tone: t.priority === 'high' ? 'danger' : 'warning',
        label: 'Due today',
        title: t.title,
        sub: t.lead.fullName,
        leadId: t.lead.id,
      });
    });

    // 7. Overdue
    overdueTasks.forEach(t => {
      items.push({
        id: `overdue_${t.id}`,
        priority: 1,
        icon: AlertTriangle,
        tone: 'danger',
        label: 'Overdue',
        title: t.title,
        sub: t.lead.fullName,
        leadId: t.lead.id,
      });
    });

    return items.sort((a, b) => a.priority - b.priority);
  }, [leads, todayStr, todayTasks, overdueTasks]);

  // Active submissions by status (ones that need ongoing attention)
  const activeSubmissions = useMemo(() => {
    const out = [];
    leads.forEach(lead => {
      (lead.submissions || []).forEach(sub => {
        if (!['approved', 'denied', 'withdrawn', 'lease-signed'].includes(sub.status)) {
          const daysSince = Math.floor((Date.now() - new Date(sub.submittedAt).getTime()) / 86400000);
          out.push({ ...sub, lead, daysSince });
        }
      });
    });
    return out.sort((a, b) => b.daysSince - a.daysSince);
  }, [leads]);

  return (
    <div className="space-y-5">
      {/* Automation status hero */}
      <div className={`p-5 rounded-2xl ${automationOn ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl ${automationOn ? 'bg-white/10' : 'bg-white'} flex items-center justify-center shrink-0`}>
            <Bot className={`w-5 h-5 ${automationOn ? '' : 'text-slate-700'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <div className="font-semibold text-base">Automation {automationOn ? 'is running' : 'is paused'}</div>
              <button
                onClick={() => saveSettings({ ...settings, automation: { ...settings.automation, enabled: !automationOn } })}
                className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${automationOn ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
              >
                {automationOn ? 'Pause' : 'Resume'}
              </button>
            </div>
            <div className={`text-sm ${automationOn ? 'text-white/70' : 'text-slate-600'}`}>
              Handling tour completions, follow-ups, and client confirmations.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
          <HeroMetric enabled={automationOn} label="Today's focus" value={focusItems.length} />
          <HeroMetric enabled={automationOn} label="Active apps" value={activeSubmissions.length} />
          <HeroMetric enabled={automationOn} label="Active leads" value={leads.filter(l => !['leased', 'lost', 'archived'].includes(l.stage)).length} />
          <HeroMetric enabled={automationOn} label="Leased" value={metrics.leased} />
        </div>
      </div>

      {/* Today's focus — the main event */}
      <Card className="p-5">
        <SectionHeader icon={Zap}>Today's focus</SectionHeader>
        {focusItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="font-semibold text-slate-900 mb-1">You're all caught up</div>
            <div className="text-sm text-slate-500">Nothing urgent. Automation will flag items here as they come in.</div>
          </div>
        ) : (
          <div className="space-y-1 -mx-2">
            {focusItems.slice(0, 10).map(item => (
              <button
                key={item.id}
                onClick={() => onSelectLead(item.leadId)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  item.tone === 'danger' ? 'bg-red-50 text-red-600' :
                  item.tone === 'warning' ? 'bg-amber-50 text-amber-600' :
                  item.tone === 'accent' ? 'bg-indigo-50 text-indigo-600' :
                  'bg-blue-50 text-blue-600'
                }`}>
                  <item.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Pill tone={item.tone}>{item.label}</Pill>
                  </div>
                  <div className="text-sm font-medium text-slate-900 truncate">{item.title}</div>
                  <div className="text-xs text-slate-500 truncate">{item.sub}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 group-hover:text-slate-500 transition-colors" />
              </button>
            ))}
            {focusItems.length > 10 && (
              <div className="text-center pt-2 text-xs text-slate-400">+ {focusItems.length - 10} more below</div>
            )}
          </div>
        )}
      </Card>

      {/* Active submissions + upcoming tours side-by-side */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionHeader icon={FileCheck}>Active applications</SectionHeader>
          {activeSubmissions.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-10">No submissions in flight</div>
          ) : (
            <div className="space-y-1 -mx-2">
              {activeSubmissions.slice(0, 5).map(sub => (
                <button key={sub.id} onClick={() => onSelectLead(sub.lead.id)} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{sub.lead.fullName} → {sub.listing.address.split(',')[0]}</div>
                    <div className="text-xs text-slate-500">
                      {sub.status === 'submitted' && `${sub.daysSince}d since submission`}
                      {sub.status === 'pending' && 'Awaiting response'}
                      {sub.status === 'conditional' && 'Conditional approval'}
                    </div>
                  </div>
                  <Pill tone={sub.status === 'submitted' ? 'info' : sub.status === 'conditional' ? 'warning' : 'neutral'}>{sub.status}</Pill>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeader icon={CalendarDays}>Upcoming tours</SectionHeader>
          {upcomingTours.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-10">No tours scheduled</div>
          ) : (
            <div className="space-y-1 -mx-2">
              {upcomingTours.slice(0, 5).map(t => {
                const d = new Date(t.date + 'T00:00:00');
                return (
                  <button key={t.id} onClick={() => onSelectLead(t.lead.id)} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center shrink-0">
                      <div className="text-[9px] uppercase text-slate-500 leading-none">{d.toLocaleDateString('en-US', { month: 'short' })}</div>
                      <div className="text-base font-semibold text-slate-900 leading-none mt-0.5">{d.getDate()}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{t.lead.fullName}</div>
                      <div className="text-xs text-slate-500">{t.time} · {(t.listings || []).length} stops</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Recent activity as a smaller tertiary block */}
      <Card className="p-5">
        <SectionHeader icon={Activity}>Recent activity</SectionHeader>
        {recentActivity.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">No activity yet</div>
        ) : (
          <div className="space-y-0.5 max-h-64 overflow-y-auto -mx-2">
            {recentActivity.slice(0, 8).map(a => (
              <button key={a.id} onClick={() => onSelectLead(a.lead.id)} className="w-full text-left flex gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <ActivityIcon type={a.type} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-900 truncate">{a.message}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{a.lead.fullName} · {timeAgo(a.timestamp)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HeroMetric({ enabled, label, value }) {
  return (
    <div className={`p-3 rounded-lg ${enabled ? 'bg-white/5' : 'bg-white border border-slate-200'}`}>
      <div className={`text-xs ${enabled ? 'text-white/60' : 'text-slate-500'} mb-0.5`}>{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ActivityIcon({ type }) {
  const map = {
    'lead-created': { icon: Plus, color: 'bg-blue-50 text-blue-600' },
    'message-sent': { icon: Mail, color: 'bg-indigo-50 text-indigo-600' },
    'tour-booked': { icon: Calendar, color: 'bg-emerald-50 text-emerald-600' },
    'post-tour-sent': { icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
    'screening-logged': { icon: Shield, color: 'bg-indigo-50 text-indigo-600' },
    'application-uploaded': { icon: FileCheck, color: 'bg-amber-50 text-amber-600' },
    'application-reviewed': { icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
  };
  const { icon: Icon, color } = map[type] || { icon: Activity, color: 'bg-slate-100 text-slate-600' };
  return <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center shrink-0`}><Icon className="w-3.5 h-3.5" /></div>;
}

// ============================================================
// LEADS LIST
// ============================================================
function LeadsListView({ leads, search, onSelectLead, saveLeads, waitlist = [] }) {
  const [filter, setFilter] = useState('all');

  const filtered = leads.filter(l => {
    const matchFilter = filter === 'all' || l.bucket === filter;
    const matchSearch = !search || l.fullName.toLowerCase().includes(search.toLowerCase()) || l.email.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const waitlistedLeadIds = new Set(waitlist.filter(w => w.status === 'waiting').map(w => w.leadId));

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        {['all', 'GCMS', 'GCM75+', 'BCMS', 'BC75+'].map(k => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{k === 'all' ? 'All' : k}</button>
        ))}
        {leads.length > 0 && (
          <button onClick={() => { if (confirm('Clear all leads?')) saveLeads([]); }} className="ml-auto text-xs text-slate-400 hover:text-red-600">Clear all</button>
        )}
      </div>

      {leads.length === 0 ? (
        <EmptyState icon={Users} title="No leads yet" desc="Submit a lead through the intake form." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Filter} title="No matches" desc="Try a different filter." />
      ) : (
        <Card className="overflow-hidden">
          {filtered.map((lead, i) => (
            <LeadRow key={lead.id} lead={lead} isFirst={i === 0} onClick={() => onSelectLead(lead.id)} waitlisted={waitlistedLeadIds.has(lead.id)} />
          ))}
        </Card>
      )}
    </>
  );
}

function LeadRow({ lead, isFirst, onClick, waitlisted }) {
  const stageInfo = PIPELINE_STAGES.find(s => s.id === (lead.stage || 'new')) || PIPELINE_STAGES[0];
  const hasApp = lead.application;
  const hasScreening = lead.screening?.status === 'completed';

  return (
    <button onClick={onClick} className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center gap-4 ${!isFirst ? 'border-t border-slate-100' : ''}`}>
      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
        {lead.fullName.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold text-slate-900 truncate">{lead.fullName}</div>
          {waitlisted && <Pill tone="warning" icon={Hourglass}>Waitlist</Pill>}
          {hasScreening && <Pill tone="accent" icon={Shield}>Screened</Pill>}
          {hasApp && <Pill tone="positive" icon={FileCheck}>App on file</Pill>}
        </div>
        <div className="text-sm text-slate-500 truncate mt-0.5">{lead.email} · Move {fmtDate(lead.moveInDate)}</div>
      </div>
      <div className="flex flex-col gap-1 items-end shrink-0">
        <Pill tone="neutral">{stageInfo.label}</Pill>
        <span className="text-[10px] text-slate-400 font-medium">{lead.bucket}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
}

// ============================================================
// FLAGS
// ============================================================
function FlagsView({ allTasks, updateLead, onSelectLead, showToast }) {
  const completeTask = (lead, taskId) => {
    updateLead(lead.id, { tasks: lead.tasks.map(t => t.id === taskId ? { ...t, status: 'done' } : t) });
    showToast('Cleared');
  };

  if (allTasks.length === 0) {
    return <EmptyState icon={Shield} title="All clear." desc="No flagged items." />;
  }

  return (
    <div className="space-y-2">
      {allTasks.map(t => (
        <Card key={t.id} className={`p-4 ${t.priority === 'high' ? 'border-red-200 bg-red-50/30' : ''}`}>
          <div className="flex items-start gap-3">
            <button onClick={() => completeTask(t.lead, t.id)} className="w-5 h-5 rounded-full border-2 border-slate-300 hover:bg-slate-900 hover:border-slate-900 shrink-0 mt-0.5 transition-colors" />
            <button onClick={() => onSelectLead(t.lead.id)} className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-slate-900">{t.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t.lead.fullName} · Due {fmtDate(t.dueDate)}</div>
              {t.flags && t.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.flags.map((f, i) => <Pill key={i} tone="danger">{f}</Pill>)}
                </div>
              )}
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// TOURS
// ============================================================
function ToursView({ upcomingTours, onSelectLead }) {
  if (upcomingTours.length === 0) return <EmptyState icon={CalendarDays} title="No scheduled tours" desc="Tours will appear here." />;
  return (
    <div className="space-y-3">
      {upcomingTours.map(t => {
        const props = t.listings || [];
        const d = new Date(t.date + 'T00:00:00');
        return (
          <Card key={t.id} className="p-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex flex-col items-center justify-center shrink-0">
                <div className="text-[10px] uppercase text-slate-500 leading-none">{d.toLocaleDateString('en-US', { month: 'short' })}</div>
                <div className="text-base font-semibold text-slate-900 leading-none mt-0.5">{d.getDate()}</div>
              </div>
              <div className="min-w-0 flex-1">
                <button onClick={() => onSelectLead(t.lead.id)} className="font-semibold text-slate-900 hover:underline">{t.lead.fullName}</button>
                <div className="text-sm text-slate-500 mt-0.5">{t.time} · {props.length} {props.length === 1 ? 'stop' : 'stops'}</div>
              </div>
              {t.tourType === 'virtual' && <Pill icon={Video}>Virtual</Pill>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
// SETTINGS
// ============================================================
function SettingsView({ settings, saveSettings, showToast, timeOffset, saveTimeOffset }) {
  const [form, setForm] = useState(settings);
  const update = (k, v) => setForm({ ...form, [k]: v });
  const updateAutomation = (k, v) => setForm({ ...form, automation: { ...form.automation, [k]: v } });
  const save = async () => { await saveSettings(form); showToast('Settings saved'); };
  const jumpTime = async (days) => { await saveTimeOffset((timeOffset || 0) + days * 86400000); showToast(`+${days} days`); };
  const resetTime = async () => { await saveTimeOffset(0); showToast('Time reset'); };
  const currentSimulatedDate = new Date(Date.now() + (timeOffset || 0));

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="divide-y divide-slate-100 overflow-hidden">
        <div className="p-5">
          <SectionHeader icon={Bot}>Automation</SectionHeader>
          <div className="text-sm text-slate-500">Toggle automated behaviors. All messages sent on your behalf.</div>
        </div>
        <AutomationRow name="Master switch" desc="Turn all automation on or off." value={form.automation?.enabled !== false} onChange={(v) => updateAutomation('enabled', v)} />
        <AutomationRow name="Auto-complete tours" desc="Mark tours complete after scheduled end time." value={form.automation?.autoCompleteTours !== false} onChange={(v) => updateAutomation('autoCompleteTours', v)} disabled={form.automation?.enabled === false} />
        <AutomationRow name="Auto-nudge silent leads" desc="Nudge after 48hrs and 5 days post-tour." value={form.automation?.autoNudgeNoResponse !== false} onChange={(v) => updateAutomation('autoNudgeNoResponse', v)} disabled={form.automation?.enabled === false} />
        <AutomationRow name="Auto-archive stale leads" desc="Archive after 30 days of no activity." value={form.automation?.autoArchiveStale !== false} onChange={(v) => updateAutomation('autoArchiveStale', v)} disabled={form.automation?.enabled === false} />
      </Card>

      <Card className="p-5">
        <SectionHeader icon={Shield}>RentSpree screening</SectionHeader>
        <div className="text-sm text-slate-600 leading-relaxed mb-4">
          When a client completes screening on RentSpree, open their report on the RentSpree dashboard, then paste the key fields into the lead's Screening tab in about 30 seconds.
        </div>
        <FormField label="RentSpree dashboard URL">
          <input value={form.rentSpree?.dashboardUrl || ''} onChange={e => update('rentSpree', { ...form.rentSpree, dashboardUrl: e.target.value })} className="form-input" placeholder="https://app.rentspree.com/dashboard" />
        </FormField>
      </Card>

      <Card className="p-5">
        <SectionHeader icon={FastForward}>Simulate time (dev)</SectionHeader>
        <div className="text-sm text-slate-700 mb-3">
          Simulated: <span className="font-semibold">{currentSimulatedDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => jumpTime(1)}>+1 day</Button>
          <Button size="sm" onClick={() => jumpTime(3)}>+3 days</Button>
          <Button size="sm" onClick={() => jumpTime(7)}>+1 week</Button>
          {timeOffset > 0 && <Button size="sm" variant="secondary" onClick={resetTime}>Reset</Button>}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader>Agent profile</SectionHeader>
        <div className="space-y-3">
          <FormField label="Your name"><input value={form.agentName} onChange={e => update('agentName', e.target.value)} className="form-input" /></FormField>
          <FormField label="Your email"><input type="email" value={form.agentEmail} onChange={e => update('agentEmail', e.target.value)} className="form-input" /></FormField>
          <FormField label="Your phone"><input type="tel" value={form.agentPhone} onChange={e => update('agentPhone', e.target.value)} className="form-input" /></FormField>
          <FormField label="Twilio number"><input type="tel" value={form.twilioNumber} onChange={e => update('twilioNumber', e.target.value)} className="form-input" /></FormField>
        </div>
      </Card>

      <Button size="lg" onClick={save}>Save settings</Button>
      <style>{`.form-input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid rgb(226 232 240); border-radius: 0.5rem; font-size: 0.875rem; outline: none; transition: border-color 0.15s; } .form-input:focus { border-color: rgb(100 116 139); }`}</style>
    </div>
  );
}

function AutomationRow({ name, desc, value, onChange, disabled }) {
  return (
    <div className={`flex items-start gap-3 p-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 text-sm mb-0.5">{name}</div>
        <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
      </div>
      <button onClick={() => !disabled && onChange(!value)} disabled={disabled} className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${value ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

// ============================================================
// SCREENING PASTE MODAL
// ============================================================
function ScreeningPasteModal({ lead, onClose, onSave, settings }) {
  const existing = lead.screening?.report;
  const [form, setForm] = useState({
    creditScore: existing?.creditScore || '',
    residenceScore: existing?.residenceScore || '',
    bureau: existing?.bureau || 'TransUnion',
    openAccounts: existing?.openAccounts || '',
    creditUtilization: existing?.creditUtilization || '',
    onTimePaymentRate: existing?.onTimePaymentRate || '',
    derogatoryMarks: existing?.derogatoryMarks || '',
    hardInquiriesLast6Months: existing?.hardInquiriesLast6Months || '',
    evictionHistory: existing?.evictionHistory || 'No records',
    evictionDetails: existing?.evictionDetails || '',
    criminalMajor: existing?.criminalMajor || 'No records',
    criminalDetails: existing?.criminalDetails || '',
    sexOffenderRegistry: existing?.sexOffenderRegistry || 'No records',
    ofacWatchlist: existing?.ofacWatchlist || 'No records',
    incomeVerified: existing?.incomeVerified || 'Not verified',
    incomeVerifiedAmount: existing?.incomeVerifiedAmount || '',
    reportId: existing?.reportId || '',
    reportPulledAt: existing?.reportPulledAt || '',
    agentNotes: existing?.agentNotes || '',
  });
  const [livePreview, setLivePreview] = useState(null);

  useEffect(() => {
    setLivePreview(interpretScreeningReport(form, lead));
  }, [form]);

  const update = (k, v) => setForm({ ...form, [k]: v });
  const canSave = form.creditScore || form.residenceScore;

  const toneMap = { approve: 'positive', conditional: 'warning', flag: 'danger' };
  const labelMap = { approve: 'Approve', conditional: 'Conditional', flag: 'Flag for review' };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-3xl md:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <ClipboardPaste className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm">Paste RentSpree report</div>
              <div className="text-xs text-slate-500 truncate">{lead.fullName}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="text-sm text-slate-700 leading-relaxed">
                  Open <a href={settings.rentSpree?.dashboardUrl || 'https://app.rentspree.com/dashboard'} target="_blank" rel="noopener noreferrer" className="text-slate-900 font-medium underline inline-flex items-center gap-1">RentSpree <ExternalLink className="w-3 h-3" /></a>, find {lead.fullName.split(' ')[0]}'s report, and copy the key fields below. Auto-scoring runs as you type.
                </div>
              </div>
            </div>

            <PasteSection title="Credit">
              <div className="grid grid-cols-2 gap-3">
                <PasteField label="Credit score *" hint="Primary FICO">
                  <input type="number" min="300" max="850" value={form.creditScore} onChange={e => update('creditScore', e.target.value)} placeholder="e.g. 712" className="paste-input" />
                </PasteField>
                <PasteField label="Bureau">
                  <select value={form.bureau} onChange={e => update('bureau', e.target.value)} className="paste-input">
                    <option>TransUnion</option><option>Experian</option><option>Equifax</option>
                  </select>
                </PasteField>
                <PasteField label="Residence score" hint="Rental-specific">
                  <input type="number" min="300" max="850" value={form.residenceScore} onChange={e => update('residenceScore', e.target.value)} placeholder="e.g. 645" className="paste-input" />
                </PasteField>
                <PasteField label="Open accounts">
                  <input type="number" min="0" value={form.openAccounts} onChange={e => update('openAccounts', e.target.value)} placeholder="e.g. 6" className="paste-input" />
                </PasteField>
                <PasteField label="Credit utilization (%)">
                  <input type="number" min="0" max="200" value={form.creditUtilization} onChange={e => update('creditUtilization', e.target.value)} placeholder="e.g. 32" className="paste-input" />
                </PasteField>
                <PasteField label="On-time payments (%)">
                  <input type="number" min="0" max="100" step="0.1" value={form.onTimePaymentRate} onChange={e => update('onTimePaymentRate', e.target.value)} placeholder="e.g. 96.5" className="paste-input" />
                </PasteField>
                <PasteField label="Derogatory marks">
                  <input type="number" min="0" value={form.derogatoryMarks} onChange={e => update('derogatoryMarks', e.target.value)} placeholder="e.g. 0" className="paste-input" />
                </PasteField>
                <PasteField label="Hard inquiries (6mo)">
                  <input type="number" min="0" value={form.hardInquiriesLast6Months} onChange={e => update('hardInquiriesLast6Months', e.target.value)} placeholder="e.g. 2" className="paste-input" />
                </PasteField>
              </div>
            </PasteSection>

            <PasteSection title="Background & eviction">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <PasteField label="Eviction history">
                  <select value={form.evictionHistory} onChange={e => update('evictionHistory', e.target.value)} className="paste-input">
                    <option>No records</option><option>Match found</option>
                  </select>
                </PasteField>
                <PasteField label="Criminal — major offenses">
                  <select value={form.criminalMajor} onChange={e => update('criminalMajor', e.target.value)} className="paste-input">
                    <option>No records</option><option>Match found</option>
                  </select>
                </PasteField>
                <PasteField label="Sex offender registry">
                  <select value={form.sexOffenderRegistry} onChange={e => update('sexOffenderRegistry', e.target.value)} className="paste-input">
                    <option>No records</option><option>Match found</option>
                  </select>
                </PasteField>
                <PasteField label="OFAC / watchlist">
                  <select value={form.ofacWatchlist} onChange={e => update('ofacWatchlist', e.target.value)} className="paste-input">
                    <option>No records</option><option>Match found</option>
                  </select>
                </PasteField>
              </div>
              {(form.evictionHistory === 'Match found' || form.criminalMajor === 'Match found') && (
                <div className="mt-3 space-y-3">
                  {form.evictionHistory === 'Match found' && (
                    <PasteField label="Eviction details">
                      <textarea value={form.evictionDetails} onChange={e => update('evictionDetails', e.target.value)} rows={2} placeholder="Year, county, disposition…" className="paste-input resize-none" />
                    </PasteField>
                  )}
                  {form.criminalMajor === 'Match found' && (
                    <PasteField label="Criminal details (paste verbatim)">
                      <textarea value={form.criminalDetails} onChange={e => update('criminalDetails', e.target.value)} rows={2} placeholder="Charge, year, disposition…" className="paste-input resize-none" />
                    </PasteField>
                  )}
                </div>
              )}
            </PasteSection>

            <PasteSection title="Income & metadata">
              <div className="grid grid-cols-2 gap-3">
                <PasteField label="Income status">
                  <select value={form.incomeVerified} onChange={e => update('incomeVerified', e.target.value)} className="paste-input">
                    <option>Not verified</option><option>Verified</option><option>Self-reported only</option>
                  </select>
                </PasteField>
                <PasteField label="Verified income ($/mo)">
                  <input type="number" min="0" value={form.incomeVerifiedAmount} onChange={e => update('incomeVerifiedAmount', e.target.value)} placeholder="e.g. 5500" className="paste-input" />
                </PasteField>
                <PasteField label="Report ID (optional)">
                  <input value={form.reportId} onChange={e => update('reportId', e.target.value)} placeholder="RS_XXXX" className="paste-input" />
                </PasteField>
                <PasteField label="Pulled on">
                  <input type="date" value={form.reportPulledAt} onChange={e => update('reportPulledAt', e.target.value)} className="paste-input" />
                </PasteField>
              </div>
              <div className="mt-3">
                <PasteField label="Your notes (optional)">
                  <textarea value={form.agentNotes} onChange={e => update('agentNotes', e.target.value)} rows={2} placeholder="Anything the numbers don't capture…" className="paste-input resize-none" />
                </PasteField>
              </div>
            </PasteSection>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3.5">
          {livePreview && canSave && (
            <div className="mb-3 flex items-start gap-2 flex-wrap">
              <Pill tone={toneMap[livePreview.recommendation]}>Auto-recommendation: {labelMap[livePreview.recommendation]}</Pill>
              <span className="text-xs text-slate-500 self-center">{livePreview.summary}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={onClose} className="flex-1">Cancel</Button>
            <button onClick={() => onSave(form)} disabled={!canSave} className="flex-1 py-3 rounded-full bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors">
              <Shield className="w-4 h-4" /> Save & notify client
            </button>
          </div>
        </div>

        <style>{`.paste-input { width: 100%; padding: 0.5rem 0.75rem; border: 1.5px solid rgb(226 232 240); border-radius: 0.625rem; font-size: 0.875rem; outline: none; transition: all 0.15s; background: white; } .paste-input:focus { border-color: rgb(15 23 42); box-shadow: 0 0 0 3px rgba(15,23,42,0.06); }`}</style>
      </div>
    </div>
  );
}

function PasteSection({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{title}</div>
      {children}
    </div>
  );
}

function PasteField({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-700 mb-1 block">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

// ============================================================
// APPLICATION UPLOAD
// ============================================================
function ApplicationUpload({ lead, onSave, onDelete, onToggleReviewed, showToast }) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef(null);
  const application = lead.application;

  const handleFiles = async (files) => {
    const file = files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showToast('Only PDF files are accepted');
      return;
    }
    if (file.size > MAX_PDF_SIZE) {
      showToast('File too large (max 10MB)');
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        await onSave({
          filename: file.name,
          size: file.size,
          dataUrl: reader.result,
        });
        setUploading(false);
      };
      reader.onerror = () => {
        showToast('Failed to read file');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setUploading(false);
      showToast('Upload failed');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFiles(e.dataTransfer.files);
  };

  const handleDownload = () => {
    if (!application) return;
    const a = document.createElement('a');
    a.href = application.dataUrl;
    a.download = application.filename;
    a.click();
  };

  const handleDelete = () => {
    if (confirm('Remove this application PDF? This cannot be undone.')) onDelete();
  };

  if (!application) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${dragActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'}`}
      >
        <input ref={fileInputRef} type="file" accept="application/pdf" onChange={(e) => handleFiles(e.target.files)} className="hidden" />
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
          {uploading ? <Hourglass className="w-5 h-5 text-slate-400 animate-pulse" /> : <Upload className="w-5 h-5 text-slate-500" />}
        </div>
        <div className="font-semibold text-slate-900 mb-1">
          {uploading ? 'Uploading…' : 'Upload application PDF'}
        </div>
        <div className="text-sm text-slate-500 mb-4">
          Drag & drop or click to browse · PDF only · Max 10MB
        </div>
        {!uploading && (
          <Button variant="secondary" icon={Upload}>Choose file</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <File className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <div className="font-semibold text-slate-900 truncate">{application.filename}</div>
              {application.reviewed && <Pill tone="positive" icon={CheckCircle2}>Reviewed</Pill>}
            </div>
            <div className="text-sm text-slate-500">
              {fmtFileSize(application.size)} · Uploaded {timeAgo(application.uploadedAt)}
              {application.reviewed && application.reviewedAt && ` · Reviewed ${timeAgo(application.reviewedAt)}`}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button size="sm" variant="secondary" icon={Eye} onClick={() => setPreviewOpen(true)}>Preview</Button>
          <Button size="sm" variant="secondary" icon={Download} onClick={handleDownload}>Download</Button>
          <Button size="sm" variant={application.reviewed ? 'outline' : 'primary'} icon={application.reviewed ? X : Check} onClick={onToggleReviewed}>
            {application.reviewed ? 'Unmark reviewed' : 'Mark reviewed'}
          </Button>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={(e) => handleFiles(e.target.files)} className="hidden" />
          <Button size="sm" variant="ghost" icon={Upload} onClick={() => fileInputRef.current?.click()}>Replace</Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto">Delete</Button>
        </div>
      </Card>

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-2xl max-w-5xl w-full h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <File className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="font-medium text-sm text-slate-900 truncate">{application.filename}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="secondary" icon={Download} onClick={handleDownload}>Download</Button>
                <button onClick={() => setPreviewOpen(false)} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <iframe src={application.dataUrl} title={application.filename} className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LEAD DETAIL
// ============================================================
function LeadDetailCRM({ lead, onClose, updateLead, onCompose, showToast, onOpenScreening, onOpenSubmit, onOpenFollowUp, settings, saveApplicationFile, deleteApplicationFile, toggleApplicationReviewed, updateSubmissionStatus }) {
  const [tab, setTab] = useState('overview');
  const stage = PIPELINE_STAGES.find(s => s.id === (lead.stage || 'new')) || PIPELINE_STAGES[0];
  const initials = lead.fullName.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const submissionCount = (lead.submissions || []).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-3xl md:rounded-2xl rounded-t-2xl max-h-[95vh] md:max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-slate-200 px-5 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-sm shrink-0">{initials}</div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{lead.fullName}</div>
                <div className="text-xs text-slate-500 truncate">{lead.email} · {lead.phone}</div>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone="neutral">{stage.label}</Pill>
            <Pill tone="neutral">{lead.bucket}</Pill>
            {lead.screening?.status === 'completed' && <Pill tone="accent" icon={Shield}>Screened</Pill>}
            {lead.application && <Pill tone="positive" icon={FileCheck}>App on file</Pill>}
            {submissionCount > 0 && <Pill tone="info">{submissionCount} {submissionCount === 1 ? 'submission' : 'submissions'}</Pill>}
            <span className="text-xs text-slate-500">Move {fmtDate(lead.moveInDate)}</span>
            <Button size="sm" icon={MessageSquare} onClick={() => onCompose('sms-custom')} className="ml-auto">Text</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 border-b border-slate-200 shrink-0 overflow-x-auto">
          {[
            { k: 'overview', label: 'Overview' },
            { k: 'application', label: 'Application', dot: !!lead.application, alert: lead.application && !lead.application.reviewed },
            { k: 'submissions', label: 'Submissions', count: submissionCount },
            { k: 'screening', label: 'Screening', dot: lead.screening?.status === 'completed' },
            { k: 'messages', label: 'Messages', count: (lead.messages || []).length },
            { k: 'activity', label: 'Activity' },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`px-3 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${tab === t.k ? 'text-slate-900 border-slate-900' : 'text-slate-500 border-transparent hover:text-slate-900'}`}>
              {t.label}
              {t.count > 0 && <span className="text-xs text-slate-400">{t.count}</span>}
              {t.alert && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
              {t.dot && !t.alert && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && (
            <div className="space-y-5">
              <div>
                <SectionHeader>Lead details</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Budget" value={`${fmtCurrency(Number(lead.budgetMin))} – ${fmtCurrency(Number(lead.budgetMax))}`} />
                  <InfoItem label="Beds / Baths" value={`${lead.beds === '0' ? 'Studio' : `${lead.beds}+ bd`} · ${lead.baths}+ ba`} />
                  <InfoItem label="Areas" value={lead.areas || 'No preference'} />
                  <InfoItem label="Move-in" value={fmtDate(lead.moveInDate)} />
                  <InfoItem label="Tour preference" value={lead.tourType === 'virtual' ? 'Virtual' : 'In-person'} />
                  <InfoItem label="Credit (self-reported)" value={lead.creditScore} />
                </div>
              </div>

              {/* Tours toured — relevant for submissions */}
              {(lead.tours || []).length > 0 && (
                <div>
                  <SectionHeader icon={CalendarDays}>Tours</SectionHeader>
                  <div className="space-y-2">
                    {(lead.tours || []).map(t => (
                      <Card key={t.id} className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="text-xs font-medium text-slate-700">{fmtDate(t.date)} · {t.time}</div>
                          <Pill tone={t.status === 'completed' ? 'positive' : 'info'}>{t.status}</Pill>
                          {t.tourType === 'virtual' && <Pill icon={Video}>Virtual</Pill>}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          {(t.listings || []).map(l => l.address.split(',')[0]).join(' · ')}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'application' && (
            <div>
              <SectionHeader icon={FileCheck} action={
                lead.application && lead.application.reviewed && (
                  <Button size="sm" icon={Send} onClick={onOpenSubmit}>Submit to landlord</Button>
                )
              }>Rental application</SectionHeader>
              <div className="text-sm text-slate-600 leading-relaxed mb-5">
                Upload the client's completed rental application PDF. Preview inline, mark as reviewed once checked, then submit to landlords.
              </div>
              <ApplicationUpload
                lead={lead}
                onSave={(fileData) => saveApplicationFile(lead.id, fileData)}
                onDelete={() => deleteApplicationFile(lead.id)}
                onToggleReviewed={() => toggleApplicationReviewed(lead.id)}
                showToast={showToast}
              />
            </div>
          )}

          {tab === 'submissions' && <SubmissionsTab lead={lead} onOpenSubmit={onOpenSubmit} onOpenFollowUp={onOpenFollowUp} updateSubmissionStatus={updateSubmissionStatus} />}

          {tab === 'screening' && <ScreeningTab lead={lead} onOpenScreening={onOpenScreening} settings={settings} />}

          {tab === 'messages' && <MessagesTab lead={lead} onCompose={onCompose} />}

          {tab === 'activity' && (
            <div>
              {(lead.activities || []).length === 0 ? (
                <EmptyState icon={Activity} title="No activity yet" />
              ) : (
                <div className="space-y-3">
                  {[...(lead.activities || [])].reverse().map(a => (
                    <div key={a.id} className="flex gap-3">
                      <ActivityIcon type={a.type} />
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="text-sm text-slate-900">{a.message}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{new Date(a.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUBMISSIONS TAB (on lead detail)
// ============================================================
function SubmissionsTab({ lead, onOpenSubmit, onOpenFollowUp, updateSubmissionStatus }) {
  const submissions = lead.submissions || [];
  const hasApp = !!lead.application;
  const appReviewed = lead.application?.reviewed;

  return (
    <div>
      <SectionHeader icon={Send} action={
        hasApp && appReviewed && <Button size="sm" icon={Plus} onClick={onOpenSubmit}>New submission</Button>
      }>Applications sent to landlords</SectionHeader>

      {!hasApp && (
        <Card className="p-5 bg-amber-50/30 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 leading-relaxed">
              Upload the client's application PDF in the Application tab before creating submissions.
            </div>
          </div>
        </Card>
      )}

      {hasApp && !appReviewed && (
        <Card className="p-5 bg-amber-50/30 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 leading-relaxed">
              Mark the application as reviewed before submitting to landlords. You want to make sure everything is complete first.
            </div>
          </div>
        </Card>
      )}

      {submissions.length === 0 && hasApp && appReviewed && (
        <EmptyState icon={Send} title="No submissions yet" desc="Submit this application to one or more landlords." action={
          <Button size="sm" icon={Plus} onClick={onOpenSubmit}>First submission</Button>
        } />
      )}

      {submissions.length > 0 && (
        <div className="space-y-3 mt-4">
          {submissions.map(sub => {
            const daysSince = Math.floor((Date.now() - new Date(sub.submittedAt).getTime()) / 86400000);
            const isStale = sub.status === 'submitted' && daysSince >= 3;
            return (
              <Card key={sub.id} className={`p-4 ${isStale ? 'border-amber-200' : ''}`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 text-sm">{sub.listing.address}</div>
                    <div className="text-xs text-slate-500">{sub.listing.neighborhood} · {fmtCurrency(sub.listing.price)}/mo</div>
                  </div>
                  <SubmissionStatusDropdown status={sub.status} onChange={(v) => updateSubmissionStatus(lead.id, sub.id, v)} />
                </div>

                <div className="text-xs text-slate-500 mb-3">
                  Sent to {sub.landlordName || 'landlord'} · {sub.landlordEmail} · {daysSince === 0 ? 'Today' : `${daysSince}d ago`}
                </div>

                {sub.followUps && sub.followUps.length > 0 && (
                  <div className="mb-3 pb-3 border-b border-slate-100">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Follow-ups</div>
                    <div className="space-y-1">
                      {sub.followUps.map((fu, i) => (
                        <div key={i} className="text-xs text-slate-600">
                          <span className="text-slate-400">{new Date(fu.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}:</span> {fu.note}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={PhoneCall} onClick={() => onOpenFollowUp(sub.id)}>Log follow-up</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubmissionStatusDropdown({ status, onChange }) {
  const options = [
    { value: 'submitted', label: 'Submitted', tone: 'info' },
    { value: 'pending', label: 'Pending', tone: 'warning' },
    { value: 'conditional', label: 'Conditional', tone: 'warning' },
    { value: 'approved', label: 'Approved', tone: 'positive' },
    { value: 'denied', label: 'Denied', tone: 'danger' },
    { value: 'withdrawn', label: 'Withdrawn', tone: 'neutral' },
    { value: 'lease-signed', label: 'Lease signed', tone: 'positive' },
  ];
  const current = options.find(o => o.value === status) || options[0];
  return (
    <select value={status} onChange={e => onChange(e.target.value)} className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer ${
      current.tone === 'positive' ? 'bg-emerald-50 text-emerald-700' :
      current.tone === 'warning' ? 'bg-amber-50 text-amber-700' :
      current.tone === 'danger' ? 'bg-red-50 text-red-700' :
      current.tone === 'info' ? 'bg-blue-50 text-blue-700' :
      'bg-slate-100 text-slate-700'
    }`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ============================================================
// MESSAGES TAB with SMS/email separation
// ============================================================
function MessagesTab({ lead, onCompose }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={MessageSquare} onClick={() => onCompose('sms-custom')}>Text client</Button>
        <Button size="sm" variant="secondary" icon={Mail} onClick={() => onCompose('email-custom')}>Email client</Button>
      </div>

      <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="font-medium text-slate-900">SMS is the default for clients.</span> Use email for formal communication, longer content, or when you need to attach files. Landlord/agent emails appear in the Submissions tab.
        </div>
      </div>

      {(lead.messages || []).length === 0 ? (
        <EmptyState icon={Mail} title="No messages yet" />
      ) : (
        <div className="space-y-3">
          {[...(lead.messages || [])].reverse().map(m => (
            <Card key={m.id} className={`p-4 ${m.internal ? 'border-amber-200 bg-amber-50/30' : ''}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${m.internal ? 'bg-amber-50 text-amber-700' : m.channel === 'sms' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                  {m.internal ? <Zap className="w-3.5 h-3.5" /> : m.channel === 'sms' ? <MessageSquare className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                </div>
                <div className="text-xs font-medium text-slate-700">{m.internal ? '→ You (internal)' : m.direction === 'outbound' ? `→ Client (${m.channel === 'sms' ? 'SMS' : 'Email'})` : 'From client'}</div>
                {m.automated && <Pill>Auto</Pill>}
                <div className="text-xs text-slate-400 ml-auto">{timeAgo(m.timestamp)}</div>
              </div>
              {m.subject && <div className="font-medium text-sm text-slate-900 mb-1">{m.subject}</div>}
              <div className="text-sm text-slate-600 whitespace-pre-wrap">{m.body}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// UNIFIED INBOX (all leads, all messages)
// ============================================================
function InboxView({ leads, onSelectLead }) {
  const [filter, setFilter] = useState('needs-reply');

  // Build unified message stream
  const allMessages = useMemo(() => {
    const out = [];
    leads.forEach(lead => {
      (lead.messages || []).forEach(msg => {
        if (msg.internal) return; // skip internal notes
        out.push({ ...msg, lead });
      });
    });
    return out.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [leads]);

  // Find threads where last message was inbound (needs reply)
  const needsReplyLeadIds = useMemo(() => {
    const ids = new Set();
    leads.forEach(lead => {
      const msgs = (lead.messages || []).filter(m => !m.internal);
      const last = msgs[msgs.length - 1];
      if (last && last.direction === 'inbound') ids.add(lead.id);
    });
    return ids;
  }, [leads]);

  const filtered = allMessages.filter(m => {
    if (filter === 'needs-reply') return needsReplyLeadIds.has(m.lead.id) && m.direction === 'inbound';
    if (filter === 'sms') return m.channel === 'sms';
    if (filter === 'email') return m.channel === 'email';
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { k: 'needs-reply', label: 'Needs reply', count: needsReplyLeadIds.size },
          { k: 'all', label: 'All messages', count: allMessages.length },
          { k: 'sms', label: 'SMS', count: allMessages.filter(m => m.channel === 'sms').length },
          { k: 'email', label: 'Email', count: allMessages.filter(m => m.channel === 'email').length },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${filter === f.k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {f.label}
            {f.count > 0 && <span className={`text-[10px] ${filter === f.k ? 'text-white/60' : 'text-slate-400'}`}>{f.count}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Inbox} title={filter === 'needs-reply' ? 'Inbox zero ✨' : 'No messages'} desc={filter === 'needs-reply' ? 'All conversations are up to date.' : 'Messages will appear here as they come in.'} />
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 50).map(m => (
            <button key={m.id} onClick={() => onSelectLead(m.lead.id)} className="w-full text-left">
              <Card className="p-4 hover:border-slate-300 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${m.channel === 'sms' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                    {m.channel === 'sms' ? <MessageSquare className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <div className="font-semibold text-slate-900 text-sm">{m.lead.fullName}</div>
                      <Pill tone={m.channel === 'sms' ? 'positive' : 'info'}>{m.channel.toUpperCase()}</Pill>
                      <Pill tone={m.direction === 'inbound' ? 'warning' : 'neutral'}>
                        {m.direction === 'inbound' ? 'from them' : 'from you'}
                      </Pill>
                      {m.automated && <Pill>Auto</Pill>}
                      <div className="text-xs text-slate-400 ml-auto">{timeAgo(m.timestamp)}</div>
                    </div>
                    {m.subject && <div className="text-sm font-medium text-slate-700 truncate mb-0.5">{m.subject}</div>}
                    <div className="text-sm text-slate-600 line-clamp-2">{m.body}</div>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BULK SMS BLAST VIEW
// ============================================================
function BlastView({ leads, showToast }) {
  const [bodyTemplate, setBodyTemplate] = useState('Hi {firstName} — new listing match for you. Want me to send the details?');
  const [stages, setStages] = useState(['new', 'matched', 'tour-booked', 'post-tour']);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);

  // Available stages = union of stages on existing leads
  const availableStages = useMemo(() => {
    const s = new Set(leads.map(l => l.stage).filter(Boolean));
    return Array.from(s);
  }, [leads]);

  const toggleStage = (s) => setStages(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const runDryRun = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/sms/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyTemplate, filter: { stages }, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Preview failed'); return; }
      setPreview(data);
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const queueBlast = async () => {
    if (!preview) return;
    const segments = Math.ceil(bodyTemplate.length / 160);
    const minutes = Math.ceil(preview.sendableCount / 25);
    const ok = window.confirm(
      `Queue an SMS blast?\n\n` +
      `Recipients: ${preview.sendableCount}\n` +
      `Opted-out (skipped): ${preview.optedOutCount}\n` +
      `Segments per message: ${segments}\n` +
      `Estimated wall-clock to drain: ~${minutes} minute${minutes === 1 ? '' : 's'}\n\n` +
      `Click OK to queue. Messages start sending within ~1 minute.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/sms/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyTemplate, filter: { stages }, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Queue failed'); return; }
      showToast(`Blast queued: ${data.queuedCount} recipients`);
      setPreview(null);
      // Refresh recent
      fetchRecent();
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fetchRecent = async () => {
    try {
      const res = await fetch('/api/sms/blast');
      const data = await res.json();
      if (res.ok) setRecent(data.blasts || []);
    } catch {}
  };

  useEffect(() => { fetchRecent(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Bulk SMS</h2>
        <p className="text-sm text-slate-500">Sends pace at ~25 messages/min to stay under A2P 10DLC throughput. Opted-out leads are excluded automatically.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Message</label>
          <textarea
            value={bodyTemplate}
            onChange={(e) => { setBodyTemplate(e.target.value); setPreview(null); }}
            rows={4}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 resize-none"
            placeholder="Hi {firstName} — ..."
          />
          <div className="text-xs text-slate-400 mt-1">
            {bodyTemplate.length} chars · {Math.ceil(bodyTemplate.length / 160)} segment{Math.ceil(bodyTemplate.length / 160) === 1 ? '' : 's'} per recipient · use {'{firstName}'} for personalization
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Audience — stages</label>
          <div className="flex flex-wrap gap-2">
            {availableStages.length === 0 && <span className="text-xs text-slate-400">No leads in DB yet.</span>}
            {availableStages.map(s => (
              <button
                key={s}
                onClick={() => { toggleStage(s); setPreview(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  stages.includes(s) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={runDryRun} disabled={busy || !bodyTemplate.trim() || stages.length === 0}>
            {busy ? 'Working…' : 'Preview audience'}
          </Button>
          {preview && (
            <Button variant="primary" onClick={queueBlast} disabled={busy || preview.sendableCount === 0}>
              Queue blast ({preview.sendableCount})
            </Button>
          )}
        </div>

        {preview && (
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 text-sm">
            <div className="flex flex-wrap gap-4 mb-3">
              <div><span className="text-slate-500">Will send:</span> <span className="font-semibold">{preview.sendableCount}</span></div>
              <div><span className="text-slate-500">Opted out:</span> <span className="font-semibold">{preview.optedOutCount}</span></div>
              <div><span className="text-slate-500">Audience total:</span> <span className="font-semibold">{preview.totalCount}</span></div>
            </div>
            {preview.sample && preview.sample.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Sample (first 10):</div>
                <ul className="text-xs text-slate-700 space-y-0.5">
                  {preview.sample.map(l => (
                    <li key={l.id}>• {l.full_name} ({l.phone})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {recent.length > 0 && (
        <Card className="p-5">
          <div className="text-sm font-semibold text-slate-900 mb-3">Recent blasts</div>
          <div className="space-y-2">
            {recent.map(b => (
              <div key={b.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg p-3">
                <div className="min-w-0">
                  <div className="text-slate-700 truncate">{b.body_template}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {new Date(b.created_at).toLocaleString()} · {b.status}
                  </div>
                </div>
                <div className="text-xs text-slate-500 shrink-0 ml-3">
                  {b.sent_count}/{b.total_count} sent · {b.failed_count} failed · {b.opted_out_count} opted out
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// ALL SUBMISSIONS VIEW (top-level admin tab)
// ============================================================
function SubmissionsView({ leads, onSelectLead, updateSubmissionStatus }) {
  const [filter, setFilter] = useState('active');

  const allSubmissions = useMemo(() => {
    const out = [];
    leads.forEach(lead => {
      (lead.submissions || []).forEach(sub => {
        out.push({ ...sub, lead });
      });
    });
    return out.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  }, [leads]);

  const filtered = allSubmissions.filter(s => {
    if (filter === 'active') return !['approved', 'denied', 'withdrawn', 'lease-signed'].includes(s.status);
    if (filter === 'approved') return ['approved', 'lease-signed'].includes(s.status);
    if (filter === 'closed') return ['denied', 'withdrawn'].includes(s.status);
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { k: 'active', label: 'Active', count: allSubmissions.filter(s => !['approved', 'denied', 'withdrawn', 'lease-signed'].includes(s.status)).length },
          { k: 'approved', label: 'Won', count: allSubmissions.filter(s => ['approved', 'lease-signed'].includes(s.status)).length },
          { k: 'closed', label: 'Lost', count: allSubmissions.filter(s => ['denied', 'withdrawn'].includes(s.status)).length },
          { k: 'all', label: 'All', count: allSubmissions.length },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${filter === f.k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {f.label}
            {f.count > 0 && <span className={`text-[10px] ${filter === f.k ? 'text-white/60' : 'text-slate-400'}`}>{f.count}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileCheck} title="No submissions" desc="Submitted applications will track here." />
      ) : (
        <div className="space-y-3">
          {filtered.map(sub => {
            const daysSince = Math.floor((Date.now() - new Date(sub.submittedAt).getTime()) / 86400000);
            return (
              <Card key={sub.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <button onClick={() => onSelectLead(sub.lead.id)} className="font-semibold text-slate-900 text-sm hover:underline">{sub.lead.fullName}</button>
                    <div className="text-xs text-slate-500">→ {sub.listing.address} · {daysSince === 0 ? 'Today' : `${daysSince}d ago`}</div>
                  </div>
                  <SubmissionStatusDropdown status={sub.status} onChange={(v) => updateSubmissionStatus(sub.lead.id, sub.id, v)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SUBMIT APPLICATION MODAL
// ============================================================
function SubmitApplicationModal({ lead, onClose, onSubmit, settings }) {
  const firstName = lead.fullName.split(' ')[0];

  // Collect toured listings as primary choices
  const touredListings = useMemo(() => {
    const seen = new Set();
    const out = [];
    (lead.tours || []).forEach(tour => {
      (tour.listings || []).forEach(listing => {
        if (!seen.has(listing.id)) {
          seen.add(listing.id);
          out.push(listing);
        }
      });
    });
    return out;
  }, [lead]);

  const [mode, setMode] = useState(touredListings.length > 0 ? 'toured' : 'manual');
  const [selectedListing, setSelectedListing] = useState(null);
  const [manualListing, setManualListing] = useState({
    address: '', neighborhood: '', price: '', leasingContact: '', leasingOffice: '', listingAgent: '',
  });

  const activeListing = mode === 'toured' ? selectedListing : (manualListing.address ? {
    id: `manual_${Date.now()}`,
    address: manualListing.address,
    neighborhood: manualListing.neighborhood,
    price: Number(manualListing.price) || 0,
    leasingContact: manualListing.leasingContact,
    leasingOffice: manualListing.leasingOffice,
    listingAgent: manualListing.listingAgent,
  } : null);

  // Auto-generate email
  const emailSubject = activeListing ? `Rental application — ${firstName} ${lead.fullName.split(' ').slice(1).join(' ')} for ${activeListing.address}` : '';

  const emailBody = activeListing ? `Hi ${activeListing.listingAgent || activeListing.leasingOffice || 'there'},

I'm submitting a rental application on behalf of my client, ${lead.fullName}, for the unit at ${activeListing.address}.

Applicant highlights:
• Desired move-in: ${fmtDate(lead.moveInDate)}
• Budget: ${fmtCurrency(Number(lead.budgetMin))}–${fmtCurrency(Number(lead.budgetMax))}/mo
• Employment: ${lead.employed}
• Credit score (self-reported): ${lead.creditScore}${lead.screening?.status === 'completed' ? `\n• Full screening completed: ${lead.screening.interpretation?.summary || 'see attached'}` : ''}${lead.application ? `\n• Application PDF attached` : ''}

Please find the completed application attached. Let me know if you need anything else from us, or if you'd like to set up a call to discuss.

Best,
${settings.agentName || '[Your name]'}
${settings.agentPhone || ''}
${settings.agentEmail || ''}` : '';

  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [copied, setCopied] = useState(false);

  // Update edited fields when activeListing changes
  useEffect(() => {
    setEditedSubject(emailSubject);
    setEditedBody(emailBody);
  }, [activeListing?.id]);

  const handleCopyEmail = () => {
    const toLine = activeListing?.leasingContact ? `To: ${activeListing.leasingContact}\n` : '';
    const fullEmail = `${toLine}Subject: ${editedSubject}\n\n${editedBody}`;
    navigator.clipboard?.writeText(fullEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSubmit = () => {
    if (!activeListing) return;
    onSubmit({
      listing: activeListing,
      landlordEmail: activeListing.leasingContact || '',
      landlordName: activeListing.listingAgent || activeListing.leasingOffice || '',
      emailSubject: editedSubject,
      emailBody: editedBody,
    });
  };

  const canSubmit = activeListing && editedSubject && editedBody;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm">Submit application to landlord</div>
              <div className="text-xs text-slate-500 truncate">{lead.fullName}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Step 1: Pick property */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">1. Which property?</div>
              {touredListings.length > 0 && (
                <div className="flex gap-1 p-0.5 bg-slate-100 rounded-full mb-3 w-fit">
                  <button onClick={() => { setMode('toured'); setSelectedListing(null); }} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${mode === 'toured' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>From tours</button>
                  <button onClick={() => setMode('manual')} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${mode === 'manual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Enter manually</button>
                </div>
              )}

              {mode === 'toured' && (
                <div className="space-y-2">
                  {touredListings.map(l => (
                    <button key={l.id} onClick={() => setSelectedListing(l)} className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${selectedListing?.id === l.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center gap-3">
                        {l.image && <img src={l.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-slate-900 truncate">{l.address}</div>
                          <div className="text-xs text-slate-500 truncate">{l.neighborhood} · {fmtCurrency(l.price)}/mo</div>
                          {l.listingAgent && <div className="text-xs text-slate-500 truncate">Agent: {l.listingAgent} · {l.leasingContact}</div>}
                        </div>
                        {selectedListing?.id === l.id && <Check className="w-5 h-5 text-slate-900 shrink-0" strokeWidth={2.5} />}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {mode === 'manual' && (
                <div className="space-y-2">
                  <input value={manualListing.address} onChange={e => setManualListing({ ...manualListing, address: e.target.value })} placeholder="Property address" className="form-input-inline" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={manualListing.neighborhood} onChange={e => setManualListing({ ...manualListing, neighborhood: e.target.value })} placeholder="Neighborhood" className="form-input-inline" />
                    <input type="number" value={manualListing.price} onChange={e => setManualListing({ ...manualListing, price: e.target.value })} placeholder="Monthly rent" className="form-input-inline" />
                  </div>
                  <input value={manualListing.leasingContact} onChange={e => setManualListing({ ...manualListing, leasingContact: e.target.value })} placeholder="Landlord/leasing office email" className="form-input-inline" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={manualListing.listingAgent} onChange={e => setManualListing({ ...manualListing, listingAgent: e.target.value })} placeholder="Contact name" className="form-input-inline" />
                    <input value={manualListing.leasingOffice} onChange={e => setManualListing({ ...manualListing, leasingOffice: e.target.value })} placeholder="Office name (optional)" className="form-input-inline" />
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Email preview */}
            {activeListing && (
              <>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">2. Email preview — edit as needed</div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-3 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span>To: <span className="font-medium text-slate-900">{activeListing.leasingContact || '[no email on file — add manually when you paste]'}</span></span>
                  </div>
                  <div className="space-y-2">
                    <input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} placeholder="Subject" className="form-input-inline font-medium" />
                    <textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} rows={12} className="form-input-inline resize-none font-mono text-xs" />
                  </div>
                </div>

                {/* Step 3: Checklist */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">3. Before you paste into Gmail</div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 leading-relaxed">
                        <div className="font-semibold mb-1">Don't forget:</div>
                        <ul className="space-y-0.5 list-disc list-inside">
                          <li>Attach <span className="font-mono bg-amber-100 px-1 rounded">{lead.application?.filename || 'the application PDF'}</span> from your downloads</li>
                          {lead.screening?.status === 'completed' && <li>Consider attaching the screening report PDF too</li>}
                          <li>Double-check the recipient email</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3.5">
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={onClose} className="flex-1">Cancel</Button>
            <button
              onClick={handleCopyEmail}
              disabled={!canSubmit}
              className="flex-1 py-3 rounded-full bg-slate-100 text-slate-900 text-sm font-medium hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
            >
              {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><ClipboardPaste className="w-4 h-4" /> Copy email</>}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-3 rounded-full bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Send className="w-4 h-4" /> Log as sent
            </button>
          </div>
          <div className="text-xs text-slate-500 text-center mt-2">
            "Log as sent" tracks this in the CRM — click after you've pasted + sent the email from Gmail.
          </div>
        </div>

        <style>{`.form-input-inline { width: 100%; padding: 0.625rem 0.75rem; border: 1.5px solid rgb(226 232 240); border-radius: 0.625rem; font-size: 0.875rem; outline: none; transition: all 0.15s; background: white; } .form-input-inline:focus { border-color: rgb(15 23 42); box-shadow: 0 0 0 3px rgba(15,23,42,0.06); }`}</style>
      </div>
    </div>
  );
}

// ============================================================
// LOG FOLLOW-UP MODAL
// ============================================================
function LogFollowUpModal({ lead, submissionId, onClose, onLog }) {
  const [note, setNote] = useState('');
  const submission = (lead.submissions || []).find(s => s.id === submissionId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <div className="font-semibold text-slate-900 text-sm">Log follow-up</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {submission && (
            <div className="text-xs text-slate-500">
              {lead.fullName} → {submission.listing.address}
            </div>
          )}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={5}
            placeholder="What did you hear back? (e.g., 'Left voicemail with Sarah' or 'Landlord responded, wants co-signer info')"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 resize-none"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={onClose} className="flex-1">Cancel</Button>
            <button onClick={() => note.trim() && onLog(note.trim())} disabled={!note.trim()} className="flex-1 py-2.5 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">Log follow-up</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreeningTab({ lead, onOpenScreening, settings }) {
  if (!lead.screening) {
    return (
      <div className="space-y-4">
        <SectionHeader icon={Shield}>Tenant screening</SectionHeader>
        <Card className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 mb-1">No screening report yet</div>
              <div className="text-sm text-slate-600 leading-relaxed">
                Once {lead.fullName.split(' ')[0]} completes their screening on RentSpree, paste the key fields here. About 30 seconds of work — auto-scoring runs instantly and the client gets an auto-response.
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" icon={ExternalLink} onClick={() => window.open(settings.rentSpree?.dashboardUrl || 'https://app.rentspree.com/dashboard', '_blank')} className="flex-1">Open RentSpree</Button>
            <Button icon={ClipboardPaste} onClick={onOpenScreening} className="flex-1">Paste report</Button>
          </div>
        </Card>
      </div>
    );
  }

  const r = lead.screening.report;
  const interp = lead.screening.interpretation;
  const recMap = {
    approve: { tone: 'positive', icon: Award, label: 'Approve' },
    conditional: { tone: 'warning', icon: AlertTriangle, label: 'Conditional approval' },
    flag: { tone: 'danger', icon: Flag, label: 'Flag for review' },
  };
  const rec = recMap[interp?.recommendation] || recMap.approve;

  return (
    <div className="space-y-4">
      <SectionHeader icon={Shield} action={
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.open(settings.rentSpree?.dashboardUrl || 'https://app.rentspree.com/dashboard', '_blank')}>RentSpree</Button>
          <Button size="sm" variant="ghost" icon={Edit3} onClick={onOpenScreening}>Edit</Button>
        </div>
      }>Screening report</SectionHeader>

      <Card className={`p-4 ${
        interp?.recommendation === 'approve' ? 'border-emerald-200 bg-emerald-50/30' :
        interp?.recommendation === 'conditional' ? 'border-amber-200 bg-amber-50/30' :
        'border-red-200 bg-red-50/30'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            interp?.recommendation === 'approve' ? 'bg-emerald-100 text-emerald-700' :
            interp?.recommendation === 'conditional' ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>
            <rec.icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 mb-0.5">{rec.label}</div>
            <div className="text-sm text-slate-700">{interp?.summary}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Credit score</div>
          <div className="text-3xl font-semibold text-slate-900 tabular-nums">{r.creditScore || '—'}</div>
          <div className="text-xs text-slate-500 mt-1">{r.bureau || 'TransUnion'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Residence score</div>
          <div className="text-3xl font-semibold text-slate-900 tabular-nums">{r.residenceScore || '—'}</div>
          <div className="text-xs text-slate-500 mt-1">Rental-specific</div>
        </Card>
      </div>

      {(interp?.flags?.length > 0 || interp?.strengths?.length > 0) && (
        <Card className="p-4 space-y-3">
          {interp.flags.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-red-600 mb-1.5">Flags</div>
              <div className="flex flex-wrap gap-1.5">
                {interp.flags.map((f, i) => <Pill key={i} tone="danger">{f}</Pill>)}
              </div>
            </div>
          )}
          {interp.strengths.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">Strengths</div>
              <div className="flex flex-wrap gap-1.5">
                {interp.strengths.map((s, i) => <Pill key={i} tone="positive">{s}</Pill>)}
              </div>
            </div>
          )}
        </Card>
      )}

      {(r.openAccounts || r.creditUtilization || r.onTimePaymentRate) && (
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Credit details</div>
          <div className="grid grid-cols-2 gap-3">
            <InfoItem label="Open accounts" value={r.openAccounts || '—'} />
            <InfoItem label="Utilization" value={r.creditUtilization ? `${r.creditUtilization}%` : '—'} />
            <InfoItem label="On-time payments" value={r.onTimePaymentRate ? `${r.onTimePaymentRate}%` : '—'} />
            <InfoItem label="Derogatory marks" value={r.derogatoryMarks || '—'} />
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Background check</div>
        <div className="space-y-2 text-sm">
          {[
            { label: 'Eviction history', value: r.evictionHistory },
            { label: 'Major criminal offenses', value: r.criminalMajor },
            { label: 'Sex offender registry', value: r.sexOffenderRegistry },
            { label: 'OFAC / watchlist', value: r.ofacWatchlist },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-slate-600">{label}</span>
              <span className={`font-medium ${value === 'No records' ? 'text-emerald-700' : 'text-red-700'}`}>{value}</span>
            </div>
          ))}
        </div>
        {(r.evictionDetails || r.criminalDetails) && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            {r.evictionDetails && <div><div className="text-xs text-slate-500 mb-0.5">Eviction details</div><div className="text-sm text-slate-700">{r.evictionDetails}</div></div>}
            {r.criminalDetails && <div><div className="text-xs text-slate-500 mb-0.5">Criminal details</div><div className="text-sm text-slate-700">{r.criminalDetails}</div></div>}
          </div>
        )}
      </Card>

      {r.agentNotes && (
        <Card className="p-4 bg-slate-50">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Your notes</div>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{r.agentNotes}</div>
        </Card>
      )}

      <div className="text-xs text-slate-400 text-center">
        {r.reportId && `${r.reportId} · `}
        Logged {new Date(lead.screening.enteredAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </div>
    </div>
  );
}

function ComposeModal({ lead, template, onClose, onSend }) {
  const tpl = MESSAGE_TEMPLATES[template] || MESSAGE_TEMPLATES.custom;
  const firstName = lead.fullName.split(' ')[0];
  const fill = (str) => str.replace(/{firstName}/g, firstName).replace(/{areas}/g, lead.areas || 'your area');
  // Default channel based on template name
  const defaultChannel = template?.startsWith('email') ? 'email' : 'sms';
  const [channel, setChannel] = useState(defaultChannel);
  const [subject, setSubject] = useState(fill(tpl.subject));
  const [body, setBody] = useState(fill(tpl.body));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-xl md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900 text-sm">Message to {lead.fullName}</div>
            <div className="text-xs text-slate-500">{channel === 'sms' ? `SMS to ${lead.phone}` : `Email to ${lead.email}`}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setChannel('sms')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${channel === 'sms' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <MessageSquare className="w-4 h-4" /> SMS <Pill tone={channel === 'sms' ? 'dark' : 'neutral'} className="ml-1">default</Pill>
            </button>
            <button onClick={() => setChannel('email')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${channel === 'email' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <Mail className="w-4 h-4" /> Email
            </button>
          </div>
          {channel === 'email' && (
            <FormField label="Subject"><input value={subject} onChange={e => setSubject(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400" /></FormField>
          )}
          <FormField label={channel === 'sms' ? 'Message (keep it short)' : 'Message'}>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={channel === 'sms' ? 4 : 8} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 resize-none" />
            {channel === 'sms' && <div className="text-xs text-slate-400 mt-1">{body.length} characters · {Math.ceil(body.length / 160)} SMS segment{Math.ceil(body.length / 160) !== 1 ? 's' : ''}</div>}
          </FormField>
          <button onClick={() => onSend({ channel, subject, body })} disabled={!body.trim()} className="w-full py-2.5 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-30">
            <Send className="w-4 h-4" /> Send {channel === 'sms' ? 'text' : 'email'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm text-slate-900 font-medium">{value}</div>
    </div>
  );
}