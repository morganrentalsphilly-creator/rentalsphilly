'use client';

import { sendEmail, sendSMS } from '@/lib/messaging';
import { loadAll, loadPublic } from '@/lib/db';
import {
  createBrowserSupabase,
  getSession,
  signInWithPassword,
  signInWithMagicLink,
  signOut,
  onAuthChange,
} from '@/lib/supabase.client';
import { isAdminEmail } from '@/lib/auth';
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

// Filter the active property pool against a lead's criteria.
// Takes `pool` as a parameter so the caller passes in the live DB-backed
// properties array (or MOCK_LISTINGS as a fallback if the DB is empty).
// `excludedBrokerages` is a lowercased Set of brokerage names to hide globally.
const matchListings = (lead, pool, excludedBrokerages) => {
  const source = (pool && pool.length > 0) ? pool : MOCK_LISTINGS;
  const blocked = excludedBrokerages instanceof Set
    ? excludedBrokerages
    : new Set((excludedBrokerages || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  // Range-aware bed/bath matching. "4+" or "3+" as the max means no upper
  // bound, so we coerce those to Infinity. If only legacy `beds`/`baths`
  // (single value) is present, treat them as the min and leave max open.
  const parseUpper = (s) => {
    if (s == null || s === '') return Infinity;
    if (typeof s === 'string' && s.endsWith('+')) return Infinity;
    const n = Number(s);
    return Number.isFinite(n) ? n : Infinity;
  };
  const bedsMin = Number(lead.bedsMin ?? lead.beds ?? 0) || 0;
  const bedsMax = parseUpper(lead.bedsMax ?? lead.beds);
  const bathsMin = Number(lead.bathsMin ?? lead.baths ?? 0) || 0;
  const bathsMax = parseUpper(lead.bathsMax ?? lead.baths);

  return source.filter(l => {
    if (l.status && l.status !== 'active') return false;
    const office = String(l.listOffice || l.leasingOffice || '').trim().toLowerCase();
    if (office && blocked.has(office)) return false;
    const priceOk = l.price >= (Number(lead.budgetMin) || 0) && l.price <= (Number(lead.budgetMax) || 99999);
    const bedsOk = l.beds >= bedsMin && l.beds <= bedsMax;
    const bathsOk = l.baths >= bathsMin && l.baths <= bathsMax;
    const areaOk = !lead.areas || lead.areas.trim() === '' ||
      lead.areas.toLowerCase().split(/[,;]/).some(a => {
        const q = a.trim();
        return q && ((l.neighborhood || '').toLowerCase().includes(q) || (l.zip || '').includes(q));
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

  // Agent showing-availability — date-specific shifts that power the time
  // picker on /c/[token]. Each shift is a real calendar entry; the system
  // splits a shift into 1-hour bookable slots.
  //   shifts: [{ id, date: 'YYYY-MM-DD', start: 'HH:MM' (24h), end: 'HH:MM' (24h), label? }]
  //   blocked_dates: ['YYYY-MM-DD', ...]  (vacations / days off, kills any
  //     shift that happens to fall on that date)
  //
  // `weekly_template` is OPTIONAL — it's just a convenience for the agent to
  // auto-fill the next N weeks of shifts via a button. The actual source of
  // truth is `shifts`. weekly_template format:
  //   { 0: [{ start: '17:00', end: '19:00' }], 1: [...], ... }  (0=Sun)
  agent_availability: {
    shifts: [],
    blocked_dates: [],
    weekly_template: {
      0: [],
      1: [],
      2: [{ start: '17:00', end: '19:00' }],
      3: [{ start: '17:00', end: '19:00' }],
      4: [{ start: '17:00', end: '19:00' }],
      5: [{ start: '17:00', end: '19:00' }],
      6: [{ start: '10:00', end: '15:00' }],
    },
  },

  // Per-category welcome message templates. Sent automatically when a new
  // lead is created, based on the classification bucket:
  //   GCMS  = Good credit (650+), moving in <75 days   — HOT, send curated link ASAP
  //   GCM75+= Good credit (650+), moving in 75+ days   — WARM, schedule a 75-day nudge
  //   BCMS  = Limited credit (<650), moving in <75 days — WORK WITH, flag credit options
  //   BC75+ = Limited credit (<650), moving in 75+ days — LONGTAIL, light touch
  //
  // Available placeholders: {firstName}, {moveInDate}, {agentName}
  // Quick-reply templates the user can edit/add/delete in Settings → Templates.
  // Available placeholders: {firstName}, {portalUrl}, {tourDate}, {tourTime}, {agentName}.
  // Shown in the inbox composer as one-click inserts.
  quickReplyTemplates: [
    {
      id: 'qr_portal',
      label: 'Send portal link',
      channel: 'sms',
      body: "Hi {firstName} — here's the portal link with rentals matching your criteria: {portalUrl}\n\nReply with the addresses you'd like to tour.",
    },
    {
      id: 'qr_ask_times',
      label: 'Ask for tour times',
      channel: 'sms',
      body: "Hi {firstName} — what days/times work best for a tour this week or next?",
    },
    {
      id: 'qr_confirm_tour',
      label: 'Confirm tour',
      channel: 'sms',
      body: "Hi {firstName} — confirming your tour on {tourDate} at {tourTime}. See you there!",
    },
    {
      id: 'qr_post_tour',
      label: 'Post-tour follow up',
      channel: 'sms',
      body: "Hi {firstName} — what were your thoughts on the properties? Want to put together an application?",
    },
    {
      id: 'qr_nudge',
      label: 'Nudge after silence',
      channel: 'sms',
      body: "Hi {firstName} — checking in. Want me to send a fresh batch of rentals based on what you've seen?",
    },
  ],

  welcomeMessages: {
    GCMS: {
      sms: `Rentals Philly: Got it {firstName} — I'm hand-picking rentals that fit you right now. Expect a personalized link with photos within a few hours.`,
      emailSubject: 'Welcome to Rentals Philly — hand-picked matches incoming',
      email: `Hi {firstName},\n\nThanks for reaching out! Since you're moving in the next couple months, I'm prioritizing your search — I'll hand-pick rentals that match your criteria and send you a personalized link within a few hours.\n\nWhen the link arrives, click through to view photos and tell me which ones you'd like to tour. I'll handle the rest.\n\nTalk soon,\n— {agentName}`,
    },
    'GCM75+': {
      sms: `Rentals Philly: Thanks {firstName}! Since your move is further out, I'll reach out about 75 days before {moveInDate} with hand-picked options. In the meantime, save my number.`,
      emailSubject: 'Welcome to Rentals Philly — we\'ll be in touch soon',
      email: `Hi {firstName},\n\nThanks for letting us know what you're looking for. Since your move-in is further out, the rental market won't have what you need quite yet — but we'll be ready when it does.\n\nI'll reach out about 75 days before {moveInDate} with hand-picked options. In the meantime, save my number — if you have questions or your timeline changes, text me anytime.\n\nTalk soon,\n— {agentName}`,
    },
    BCMS: {
      sms: `Rentals Philly: Got it {firstName} — I'll get back to you within 24 hours. I work with all credit profiles and have options that fit your situation.`,
      emailSubject: 'Welcome to Rentals Philly — let\'s find the right fit',
      email: `Hi {firstName},\n\nThanks for reaching out! I work with prospects across all credit profiles, and there are good rental options available regardless — landlords with flexible criteria, units that accept cosigners or higher deposits, and so on.\n\nGive me 24 hours and I'll come back with a hand-picked list of rentals that fit your situation. We'll talk about cosigner options or alternate deposit structures if that helps unlock more units.\n\nTalk soon,\n— {agentName}`,
    },
    'BC75+': {
      sms: `Rentals Philly: Thanks {firstName}! I'll reach out 75 days before {moveInDate}. If you can, work on credit in the meantime — it opens up more options. Save my number.`,
      emailSubject: 'Welcome to Rentals Philly — planning ahead',
      email: `Hi {firstName},\n\nThanks for reaching out. Since your move is further out, I'll plan to come back to you about 75 days before {moveInDate} with hand-picked rentals.\n\nOne thing to think about in the meantime: any progress you can make on your credit between now and your move will significantly widen the range of available rentals. Even getting current on a credit card or paying down a small balance can make a real difference.\n\nIf your timeline shifts or you have questions, text me anytime.\n\nTalk soon,\n— {agentName}`,
    },
  },
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
// HYDRATION — merge separate DB arrays into nested per-lead shape
// ============================================================
// The /api/data?resource=all loader returns leads, tours, messages, etc. as
// separate top-level arrays. The UI was built expecting per-lead nesting
// (lead.tours, lead.messages, lead.activities, lead.tasks). Without this
// merge step, none of that data shows up after a page refresh — which broke
// tour history, the inbox, and the lead detail view.
//
// We also translate snake_case DB columns to camelCase the UI expects.
function hydrateLeads(data) {
  const groupBy = (arr) => {
    const map = {};
    for (const row of arr || []) {
      const key = row.lead_id;
      if (!key) continue;
      (map[key] = map[key] || []).push(row);
    }
    return map;
  };

  const toursByLead = groupBy(data.tours);
  const msgsByLead = groupBy(data.messages);
  const actsByLead = groupBy(data.activities);
  const tasksByLead = groupBy(data.tasks);
  const subsByLead = groupBy(data.submissions);
  const nudgesByLead = groupBy(data.scheduledNudges);

  return (data.leads || []).map((lead) => ({
    // Original snake_case fields stay (some places read them directly)
    ...lead,
    // camelCase aliases for compatibility with the UI written before the refactor
    fullName: lead.full_name || lead.fullName,
    moveInDate: lead.move_in_date || lead.moveInDate,
    budgetMin: lead.budget_min ?? lead.budgetMin,
    budgetMax: lead.budget_max ?? lead.budgetMax,
    creditScore: lead.credit_score || lead.creditScore,
    tourType: lead.tour_type || lead.tourType,
    applicationStatus: lead.application_status,
    createdAt: lead.created_at || lead.createdAt,
    opted_out: !!lead.opted_out,
    // Range + tour windows live in raw jsonb to avoid a schema migration.
    bedsMin: lead.raw?.beds_min || null,
    bedsMax: lead.raw?.beds_max || null,
    bathsMin: lead.raw?.baths_min || null,
    bathsMax: lead.raw?.baths_max || null,
    tourAvailability: Array.isArray(lead.raw?.tour_availability) ? lead.raw.tour_availability : [],
    curatedLinkUrl: lead.raw?.curated_link_url || null,
    curatedLinkSentAt: lead.raw?.curated_link_sent_at || null,

    tours: (toursByLead[lead.id] || []).map((t) => ({
      id: t.id,
      date: t.date,
      time: t.time,
      status: t.status,
      tourType: t.tour_type,
      listings: t.listings,
      schedule: t.schedule,
      completedAt: t.completed_at,
      autoCompleted: !!t.auto_completed,
      remindersSent: t.reminders_sent,
      createdAt: t.created_at,
    })),

    messages: (msgsByLead[lead.id] || []).map((m) => ({
      id: m.id,
      channel: m.channel,
      direction: m.direction,
      status: m.status,
      to: m.to,
      via: m.via,
      subject: m.subject,
      body: m.body,
      automated: !!m.automated,
      internal: !!m.internal,
      kind: m.kind,
      deliveryStatus: m.delivery_status,
      twilioSid: m.twilio_sid,
      timestamp: m.created_at,
    })),

    activities: (actsByLead[lead.id] || []).map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      timestamp: a.created_at,
    })),

    tasks: (tasksByLead[lead.id] || []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      auto: !!t.auto,
      dueDate: t.due_date,
      completedAt: t.completed_at,
      relatedTourId: t.related_tour_id,
      relatedSubmissionId: t.related_submission_id,
      flags: t.flags,
    })),

    submissions: subsByLead[lead.id] || [],
    scheduledNudges: nudgesByLead[lead.id] || [],
  }));
}

// ============================================================
// PROPERTY HYDRATION — DB snake_case → UI camelCase (matches MOCK_LISTINGS shape)
// ============================================================
function hydrateProperties(rows) {
  return (rows || []).map((p) => ({
    id: p.id,
    mls: p.mls || '',
    address: p.unit ? `${p.address}, ${p.unit}` : p.address,
    neighborhood: p.neighborhood || '',
    zip: p.zip || '',
    price: Number(p.price),
    beds: Number(p.beds),
    baths: Number(p.baths),
    sqft: p.sqft != null ? Number(p.sqft) : null,
    image: (p.photos && p.photos[0]) || '',
    photos: p.photos || [],
    leasingContact: p.leasing_contact || '',
    leasingOffice: p.leasing_office || p.list_office || '',
    listOffice: p.list_office || p.leasing_office || '',
    listingAgent: p.listing_agent || '',
    listingAgentPhone: p.listing_agent_phone || '',
    availableDate: p.available_date || null,
    petPolicy: p.pet_policy || '',
    notes: p.notes || '',
    source: p.source || 'manual',
    status: p.status || 'active',
    createdAt: p.created_at,
    // Raw fields too — for the admin edit form
    _raw: p,
  }));
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  const [view, setView] = useState('landing');
  const [leads, setLeads] = useState([]);
  const [slots, setSlots] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [properties, setProperties] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_AGENT_SETTINGS);
  const [timeOffset, setTimeOffset] = useState(0);
  const [currentLead, setCurrentLead] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [adminSubview, setAdminSubview] = useState('inbox');
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [toast, setToast] = useState(null);
  // Auth state for the admin views. `session` is the Supabase session (or null);
  // `authChecked` flips to true after the initial getSession() resolves, so we
  // can avoid flashing the login screen during the first paint.
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const getNow = () => new Date(Date.now() + timeOffset);

  // ---- Auth: load initial session + subscribe to changes ------------------
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const s = await getSession();
      setSession(s);
      setAuthChecked(true);
    })();
    unsub = onAuthChange((s) => setSession(s));
    return () => { try { unsub(); } catch {} };
  }, []);

  // On mount: load only the lightweight public data (properties + settings).
  // Heavy CRM data loads lazily when the user enters admin (see effect below).
  useEffect(() => {
    (async () => {
      try {
        const data = await loadPublic();
        setProperties(hydrateProperties(data.properties || []));
        if (data.settings) setSettings({ ...DEFAULT_AGENT_SETTINGS, ...data.settings });
      } catch (e) {
        console.error('[app] Failed to load public data', e);
      }
      setLoaded(true);
    })();
  }, []);

  // Lazy: when the user enters admin AND is authed, fetch the full CRM dataset.
  // Cached after the first load — won't refetch on every admin visit within
  // the same session.
  const [adminDataLoaded, setAdminDataLoaded] = useState(false);
  useEffect(() => {
    if (view !== 'admin') return;
    if (!session) return;
    if (adminDataLoaded) return;
    (async () => {
      try {
        const data = await loadAll();
        setLeads(hydrateLeads(data));
        setSlots((data.slots || []).length > 0 ? data.slots : generateDefaultSlots());
        setWaitlist(data.waitlist || []);
        setProperties(hydrateProperties(data.properties || []));
        if (data.settings) setSettings((prev) => ({ ...DEFAULT_AGENT_SETTINGS, ...prev, ...data.settings }));
        try {
          const offsetRes = await window.storage.get('time-offset').catch(() => null);
          if (offsetRes && offsetRes.value) setTimeOffset(JSON.parse(offsetRes.value));
        } catch (e) {}
        setAdminDataLoaded(true);
      } catch (e) {
        console.error('[app] Failed to load admin data', e);
      }
    })();
  }, [view, session, adminDataLoaded]);

  // ---- Supabase Realtime: live inbox updates ------------------------------
  // Subscribe to INSERTs on the `messages` table and merge each new row into
  // the matching lead's in-memory messages array. Only runs when:
  //   - in admin AND authed (public visitors don't need it)
  //   - on the inbox subview OR with a lead detail open
  // This avoids constant re-renders when viewing properties, blast, etc.
  useEffect(() => {
    if (!loaded) return;
    if (view !== 'admin') return;
    if (!session) return;
    if (adminSubview !== 'inbox' && !selectedLeadId) return;
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
  }, [loaded, view, session, adminSubview, selectedLeadId]);

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
  // Property CRUD — DB-backed. Optimistic update + persist.
  const saveProperty = async (property) => {
    // property is the camelCase UI shape. Translate to DB shape.
    const row = {
      id: property.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      mls: property.mls || null,
      source: property.source || 'manual',
      address: property.address,
      unit: property.unit || null,
      neighborhood: property.neighborhood || null,
      zip: property.zip || null,
      price: Number(property.price) || 0,
      beds: Number(property.beds) || 0,
      baths: Number(property.baths) || 0,
      sqft: property.sqft != null && property.sqft !== '' ? Number(property.sqft) : null,
      photos: Array.isArray(property.photos) ? property.photos : (property.image ? [property.image] : []),
      list_office: property.listOffice || property.leasingOffice || null,
      leasing_office: property.leasingOffice || property.listOffice || null,
      leasing_contact: property.leasingContact || null,
      listing_agent: property.listingAgent || null,
      listing_agent_phone: property.listingAgentPhone || null,
      available_date: property.availableDate || null,
      pet_policy: property.petPolicy || null,
      notes: property.notes || null,
      status: property.status || 'active',
    };
    const db = await import('@/lib/db');
    const upserted = await db.upsertProperty(row);
    // Hydrate and merge into state
    const [hydrated] = hydrateProperties([upserted]);
    setProperties((prev) => {
      const idx = prev.findIndex((p) => p.id === hydrated.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = hydrated;
        return next;
      }
      return [hydrated, ...prev];
    });
    return hydrated;
  };

  const removeProperty = async (id) => {
    const db = await import('@/lib/db');
    await db.deleteProperty(id);
    setProperties((prev) => prev.filter((p) => p.id !== id));
  };

  // Bulk import: take an array of UI-shape property objects and upsert all.
  // Returns { imported, errors }.
  const bulkImportProperties = async (items) => {
    let imported = 0;
    let errors = 0;
    for (const item of items) {
      try {
        await saveProperty(item);
        imported++;
      } catch (e) {
        console.error('[bulk import] failed for', item.address, e);
        errors++;
      }
    }
    return { imported, errors };
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

  // Client-side automation runner — DISABLED for perf.
  //
  // This used to fire every 30s and on every leads/slots/waitlist/settings/
  // timeOffset change. Combined with awaited sendSMS calls inside runAutomation
  // and Realtime events that constantly mutate leads, it created a re-render
  // loop that tanked admin performance.
  //
  // The time-critical automation (tour reminders, bulk SMS drain) is already
  // handled server-side by /api/cron/dispatcher. Post-tour nudges and
  // auto-archive can move to the same cron later if needed.
  //
  // To re-enable for any reason, restore the previous useEffect — but use a
  // ref pattern to keep `leads` out of the dep array, otherwise the loop
  // returns.
  // useEffect(() => { ... }, [...]);

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
      if ('raw' in leadFields) leadUpdatePayload.raw = leadFields.raw;
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

    // Pick the right template based on the lead's bucket (GCMS / GCM75+ /
    // BCMS / BC75+). Each bucket has its own SMS + email pair editable in
    // Settings → Welcome messages.
    const templates = settings.welcomeMessages || DEFAULT_AGENT_SETTINGS.welcomeMessages;
    const t = templates[bucket] || templates.GCMS || DEFAULT_AGENT_SETTINGS.welcomeMessages.GCMS;
    const moveInLabel = lead.moveInDate ? fmtDate(lead.moveInDate) : 'your move date';
    const agentDisplay = (settings.agentName && settings.agentName !== '[Your name]') ? settings.agentName : 'Morgan';
    const fill = (s) => String(s || '')
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{moveInDate\}/g, moveInLabel)
      .replace(/\{agentName\}/g, agentDisplay);
    const welcomeEmailSubject = fill(t.emailSubject);
    const welcomeEmailBody = fill(t.email);
    const welcomeSmsBody = fill(t.sms);

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
    } else {
      // Moving-soon leads: agent needs to curate a BrightMLS portal link.
      // Show as today's task so it stays top-of-mind on the dashboard.
      tasks.push({
        id: `t_${Date.now()}_curate`,
        lead_id: id,
        title: `Curate BrightMLS portal link for ${firstName}`,
        due_date: new Date().toISOString().split('T')[0],
        status: 'pending',
        priority: 'high',
        auto: true,
        flags: ['curate-portal'],
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
        // Stash range + tour windows in raw jsonb so we don't need a
        // schema migration. The CRM reads these via hydrateLeads.
        raw: {
          // beds/baths stored directly on the lead row above
        },
      });
      // Activity + tasks. Email + SMS rows are inserted by the server wrappers.
      await db.insertActivity(welcomeActivity);
      for (const t of tasks) await db.insertTask(t);
    } catch (e) {
      console.error('[app] Failed to create lead in Supabase', e);
    }

    // Fire welcome email + SMS through the server wrappers. Each wrapper
    // inserts its own messages row with delivery_status tracking.
    const emailResult = await sendEmail({
      leadId: id,
      subject: welcomeEmailSubject,
      body: welcomeEmailBody,
      kind: 'welcome',
      idempotencyKey: `welcome-email-${id}`,
      automated: true,
    });
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
        // Email — actual DB row returned by the server wrapper.
        ...(emailResult?.ok && emailResult.message ? [{
          id: emailResult.message.id,
          channel: 'email',
          direction: 'outbound',
          status: emailResult.message.status || 'sent',
          to: emailResult.message.to,
          via: 'resend',
          subject: emailResult.message.subject,
          body: emailResult.message.body,
          automated: true,
          timestamp: emailResult.message.created_at || createdAt,
        }] : []),
        // SMS — actual DB row returned by the server wrapper.
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
    // Send both via server wrappers.
    const vtSmsBody = `Rentals Philly: Got your video tour request! Videos within 24 hrs.`;
    const vtEmailSubject = `Your virtual tour videos are on the way`;
    const vtEmailBody = `Hi ${firstName} — walkthrough videos for ${listings.length} properties within 24 hours.`;
    const vtEmailResult = await sendEmail({
      leadId,
      subject: vtEmailSubject,
      body: vtEmailBody,
      kind: 'virtual_tour',
      idempotencyKey: `vt-email-${virtualTour.id}`,
      automated: true,
    });
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
        ...(vtEmailResult?.ok && vtEmailResult.message ? [{
          id: vtEmailResult.message.id, channel: 'email', direction: 'outbound',
          status: vtEmailResult.message.status || 'sent',
          to: vtEmailResult.message.to, via: 'resend',
          subject: vtEmailResult.message.subject, body: vtEmailResult.message.body,
          timestamp: vtEmailResult.message.created_at || new Date().toISOString(),
          automated: true,
        }] : []),
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
    // Send both via server wrappers — each logs its own messages row.
    const tourSmsBody = `Rentals Philly: Tour confirmed ${fmtDate(tour.date)} @ ${tour.time}.`;
    const tourEmailBody = `Hi ${firstName} — tour confirmed for ${fmtDate(tour.date)} starting at ${tour.time}.`;
    const tourEmailSubject = `Tour confirmed · ${fmtDate(tour.date)} at ${tour.time}`;
    const tourEmailResult = await sendEmail({
      leadId,
      subject: tourEmailSubject,
      body: tourEmailBody,
      kind: 'tour_confirmation',
      idempotencyKey: `tour-conf-email-${newTour.id}`,
      automated: true,
    });
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
        ...(tourEmailResult?.ok && tourEmailResult.message ? [{
          id: tourEmailResult.message.id, channel: 'email', direction: 'outbound',
          status: tourEmailResult.message.status || 'sent',
          to: tourEmailResult.message.to, via: 'resend',
          subject: tourEmailResult.message.subject, body: tourEmailResult.message.body,
          timestamp: tourEmailResult.message.created_at || new Date().toISOString(),
          automated: true,
        }] : []),
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
      {view === 'intake' && <IntakeForm onSubmit={async (data) => { const l = await addLead(data); setView(l.bucket === 'GCMS' || l.bucket === 'BCMS' ? 'curating' : 'holding'); }} onBack={() => setView('landing')} />}
      {view === 'curating' && currentLead && <CuratingConfirmed lead={currentLead} agentName={settings.agentName} onDone={() => { setView('landing'); setCurrentLead(null); }} />}
      {view === 'listings' && currentLead && <ListingsView lead={currentLead} properties={properties} excludedBrokerages={settings.excluded_brokerages || []} brightPortalUrls={Array.isArray(settings.bright_portal_urls) ? settings.bright_portal_urls : (settings.bright_portal_url ? [settings.bright_portal_url] : [])} onBookTour={(listings) => {
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
      {view === 'admin' && (
        !authChecked ? (
          <div className="min-h-[60vh] flex items-center justify-center text-slate-400 text-sm">Checking access…</div>
        ) : !session ? (
          <AdminLogin />
        ) : !isAdminEmail(session.user?.email) ? (
          <AdminUnauthorized email={session.user?.email} />
        ) : !adminDataLoaded ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            Loading your CRM…
          </div>
        ) : (
          <AdminCRM leads={leads} updateLead={updateLead} saveLeads={saveLeads} slots={slots} openSlot={openSlot} closeSlot={closeSlot} waitlist={waitlist} saveWaitlist={saveWaitlist} settings={settings} saveSettings={saveSettings} subview={adminSubview} setSubview={setAdminSubview} selectedLeadId={selectedLeadId} setSelectedLeadId={setSelectedLeadId} showToast={showToast} timeOffset={timeOffset} saveTimeOffset={saveTimeOffset} saveScreeningReport={saveScreeningReport} saveApplicationFile={saveApplicationFile} deleteApplicationFile={deleteApplicationFile} toggleApplicationReviewed={toggleApplicationReviewed} createSubmission={createSubmission} updateSubmissionStatus={updateSubmissionStatus} logSubmissionFollowUp={logSubmissionFollowUp} sessionEmail={session.user?.email} properties={properties} saveProperty={saveProperty} removeProperty={removeProperty} bulkImportProperties={bulkImportProperties} />
        )
      )}
    </div>
  );
}

// ============================================================
// BRAND LOGO — uses /logo.png if present, falls back to a styled text mark
// that matches the brand colors so we can ship the redesign without
// blocking on the image file.
// ============================================================
function Logo({ size = 'md', white = false, className = '' }) {
  // Size presets — applied to the image OR the text fallback.
  const sizes = {
    xs: { img: 'h-5', text: 'text-[11px]' },
    sm: { img: 'h-6', text: 'text-xs' },
    md: { img: 'h-8', text: 'text-base' },
    lg: { img: 'h-12', text: 'text-2xl' },
    xl: { img: 'h-20', text: 'text-4xl md:text-5xl' },
  };
  const s = sizes[size] || sizes.md;
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    // Styled text fallback — gold "RENTALS" over dark "PHILLY", echoing the logo.
    return (
      <div className={`inline-flex items-baseline gap-0 leading-none font-bold tracking-[0.02em] ${s.text} ${className}`}>
        <span style={{ color: 'var(--brand-gold)' }}>RENTALS</span>
        <span className={white ? 'text-white' : 'text-brand-ink'}>PHILLY</span>
      </div>
    );
  }
  return (
    <img
      src="/logo.png"
      alt="Rentals Philly"
      onError={() => setImgFailed(true)}
      className={`${s.img} w-auto select-none ${white ? 'brightness-0 invert' : ''} ${className}`}
      draggable={false}
    />
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
    <nav className="border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-md z-40">
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        <button onClick={() => setView('landing')} className="flex items-center gap-3 -ml-1 px-1 py-1 rounded-lg hover:bg-slate-50 transition-colors">
          <Logo size="md" />
          {isAdmin && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white">
              Admin
            </span>
          )}
        </button>
        {isAdmin ? (
          <button onClick={() => { setView('landing'); if (typeof window !== 'undefined') window.location.hash = ''; }} className="px-3 py-1.5 text-sm rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            Exit admin
          </button>
        ) : (
          <button
            onClick={() => setView('intake')}
            className="px-4 py-2 text-sm rounded-full font-semibold text-white hover:bg-brand-gold-hover transition-colors"
            style={{ backgroundColor: 'var(--brand-gold)' }}
          >
            Find a rental
          </button>
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
      {/* HERO */}
      <div className="relative overflow-hidden">
        {/* Soft gradient backdrop in brand tones */}
        <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-[#f5ecdc]/40 pointer-events-none" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-5 md:px-8 pt-16 md:pt-24 pb-16 md:pb-24">
          <div className="flex justify-center mb-10 md:mb-12">
            <Logo size="xl" />
          </div>
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-semibold text-brand-ink tracking-[-0.03em] leading-[1.05] mb-5">
              Hand-picked Philly rentals,<br className="hidden md:block" />
              <span style={{ color: 'var(--brand-gold)' }}> scheduled in 2 minutes.</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-9 max-w-2xl mx-auto">
              Tell us what you&apos;re looking for. We&apos;ll match you with rentals that actually fit and lock in your tour times — no scrolling endless listings.
            </p>
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 px-7 py-4 text-base font-semibold text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
              style={{ backgroundColor: 'var(--brand-gold)' }}
            >
              Find my rental
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="text-xs text-slate-500 mt-4">Free · 2-minute form · Hand-picked by your agent</div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-16 md:py-24">
        <div className="text-center mb-12 md:mb-14">
          <div className="text-xs font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--brand-gold)' }}>How it works</div>
          <h2 className="text-3xl md:text-4xl font-semibold text-brand-ink tracking-tight leading-tight">Three steps. That&apos;s it.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: FileText,  title: 'Tell us what you want', desc: 'Budget, beds, neighborhoods, move-in date. Two minutes max.' },
            { icon: Sparkles,  title: 'Get a personalized link', desc: 'Your agent hand-picks rentals that actually fit and texts you a private portal.' },
            { icon: Calendar,  title: 'Pick a tour time', desc: 'Reply with the ones you want to see. Confirmation + reminders by SMS — done.' },
          ].map((f, i) => (
            <div key={i} className="relative bg-white rounded-2xl border border-slate-200 p-7 hover:border-slate-300 transition-colors">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: 'var(--brand-gold-soft)', color: 'var(--brand-gold)' }}>
                <f.icon className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="text-[10px] font-semibold text-slate-400 tracking-[0.15em] uppercase mb-1.5">Step {i + 1}</div>
              <div className="font-semibold text-brand-ink mb-1.5 text-lg">{f.title}</div>
              <div className="text-[15px] text-slate-600 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CLOSING CTA */}
      <div className="border-t border-slate-200 bg-brand-ink text-white">
        <div className="max-w-4xl mx-auto px-5 md:px-8 py-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight mb-4">Ready when you are.</h2>
          <p className="text-lg text-slate-300 mb-8 max-w-xl mx-auto">A real agent. Curated listings. Your tour times locked in by text.</p>
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-7 py-4 text-base font-semibold text-brand-ink rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--brand-gold)' }}
          >
            Find my rental
            <ArrowRight className="w-4 h-4" />
          </button>
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
// Philadelphia ZIP codes with approximate centroids + neighborhood label.
// Used by ZipMapPicker. Lat/lng are good enough for marker placement;
// the map shows zips as clickable circles, not polygons.
const PHILLY_ZIPS = [
  { zip: '19102', lat: 39.9509, lng: -75.1656, name: 'Rittenhouse / Center City W' },
  { zip: '19103', lat: 39.9519, lng: -75.1731, name: 'Rittenhouse / Fitler Sq' },
  { zip: '19104', lat: 39.9569, lng: -75.1969, name: 'University City / Powelton' },
  { zip: '19106', lat: 39.9498, lng: -75.1452, name: 'Old City / Society Hill' },
  { zip: '19107', lat: 39.9509, lng: -75.1568, name: 'Center City East / Washington Sq' },
  { zip: '19111', lat: 40.0589, lng: -75.0808, name: 'Fox Chase' },
  { zip: '19114', lat: 40.0656, lng: -75.0153, name: 'Torresdale' },
  { zip: '19115', lat: 40.0934, lng: -75.0567, name: 'Bustleton' },
  { zip: '19116', lat: 40.1180, lng: -75.0245, name: 'Somerton' },
  { zip: '19118', lat: 40.0734, lng: -75.2103, name: 'Chestnut Hill' },
  { zip: '19119', lat: 40.0488, lng: -75.1973, name: 'Mt Airy' },
  { zip: '19120', lat: 40.0345, lng: -75.1244, name: 'Olney / Logan' },
  { zip: '19121', lat: 39.9842, lng: -75.1689, name: 'North Phila / Brewerytown' },
  { zip: '19122', lat: 39.9802, lng: -75.1469, name: 'Norris Sq / South Kensington' },
  { zip: '19123', lat: 39.9648, lng: -75.1421, name: 'Northern Liberties / Poplar' },
  { zip: '19124', lat: 40.0188, lng: -75.0900, name: 'Frankford / Juniata' },
  { zip: '19125', lat: 39.9785, lng: -75.1289, name: 'Fishtown / East Kensington' },
  { zip: '19126', lat: 40.0501, lng: -75.1335, name: 'West Oak Lane' },
  { zip: '19127', lat: 40.0289, lng: -75.2218, name: 'Manayunk' },
  { zip: '19128', lat: 40.0353, lng: -75.2273, name: 'Roxborough' },
  { zip: '19129', lat: 40.0117, lng: -75.1881, name: 'East Falls' },
  { zip: '19130', lat: 39.9678, lng: -75.1789, name: 'Fairmount / Art Museum' },
  { zip: '19131', lat: 39.9870, lng: -75.2148, name: 'Overbrook / Wynnefield' },
  { zip: '19132', lat: 39.9970, lng: -75.1666, name: 'North Phila / Strawberry Mansion' },
  { zip: '19133', lat: 39.9912, lng: -75.1391, name: 'Fairhill' },
  { zip: '19134', lat: 39.9912, lng: -75.1170, name: 'Kensington / Port Richmond' },
  { zip: '19135', lat: 40.0186, lng: -75.0535, name: 'Tacony / Wissinoming' },
  { zip: '19136', lat: 40.0334, lng: -75.0259, name: 'Holmesburg / Mayfair' },
  { zip: '19137', lat: 39.9947, lng: -75.0786, name: 'Bridesburg' },
  { zip: '19138', lat: 40.0628, lng: -75.1568, name: 'Cedarbrook / E. Germantown' },
  { zip: '19139', lat: 39.9622, lng: -75.2360, name: 'Cobbs Creek / W. Phila' },
  { zip: '19140', lat: 40.0145, lng: -75.1450, name: 'Tioga / Nicetown' },
  { zip: '19141', lat: 40.0421, lng: -75.1488, name: 'Logan / Fern Rock' },
  { zip: '19142', lat: 39.9259, lng: -75.2294, name: 'Elmwood / SW Phila' },
  { zip: '19143', lat: 39.9418, lng: -75.2257, name: 'Cedar Park / Kingsessing' },
  { zip: '19144', lat: 40.0341, lng: -75.1727, name: 'Germantown' },
  { zip: '19145', lat: 39.9220, lng: -75.1797, name: 'South Phila W / Girard Estates' },
  { zip: '19146', lat: 39.9388, lng: -75.1786, name: 'Graduate Hospital / Point Breeze' },
  { zip: '19147', lat: 39.9356, lng: -75.1510, name: 'Queen Village / Bella Vista / Pennsport' },
  { zip: '19148', lat: 39.9201, lng: -75.1574, name: 'South Phila E / Whitman' },
  { zip: '19149', lat: 40.0364, lng: -75.0703, name: 'Rhawnhurst / Oxford Circle' },
  { zip: '19150', lat: 40.0698, lng: -75.1750, name: 'Cedarbrook' },
  { zip: '19151', lat: 39.9756, lng: -75.2581, name: 'Overbrook Park' },
  { zip: '19152', lat: 40.0608, lng: -75.0584, name: 'Pennypack / Lexington Park' },
  { zip: '19153', lat: 39.8923, lng: -75.2316, name: 'Eastwick' },
  { zip: '19154', lat: 40.0967, lng: -74.9920, name: 'Far Northeast / Parkwood' },
];

// Interactive Philly ZIP map picker. Renders Leaflet inside a modal. Loads
// Leaflet's JS via CDN on demand so it doesn't bloat the initial bundle.
function ZipMapPicker({ selected, onChange, onClose }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const [selSet, setSelSet] = useState(new Set(selected || []));

  // Sync selSet back to parent on close (handled by Save button).
  const toggle = (zip) => {
    setSelSet((prev) => {
      const next = new Set(prev);
      if (next.has(zip)) next.delete(zip); else next.add(zip);
      // Update marker color immediately.
      const m = markersRef.current[zip];
      if (m && typeof m.setStyle === 'function') {
        m.setStyle(markerStyle(next.has(zip)));
      }
      return next;
    });
  };

  const markerStyle = (isSelected) => isSelected
    ? { color: '#0f172a', fillColor: '#0f172a', fillOpacity: 0.7, weight: 2, radius: 14 }
    : { color: '#64748b', fillColor: '#e2e8f0', fillOpacity: 0.7, weight: 2, radius: 12 };

  useEffect(() => {
    // Dynamically load Leaflet JS if not already present.
    const init = () => {
      if (!window.L || !mapDivRef.current || mapRef.current) return;
      const L = window.L;
      const map = L.map(mapDivRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([39.9826, -75.1652], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18,
      }).addTo(map);

      PHILLY_ZIPS.forEach((z) => {
        const isSel = selSet.has(z.zip);
        const marker = L.circleMarker([z.lat, z.lng], markerStyle(isSel));
        marker.bindTooltip(`${z.zip} · ${z.name}`, { direction: 'top', offset: [0, -8] });
        marker.on('click', () => toggle(z.zip));
        marker.addTo(map);
        markersRef.current[z.zip] = marker;
      });

      mapRef.current = map;
    };

    if (window.L) {
      init();
    } else {
      const existing = document.querySelector('script[data-leaflet="1"]');
      if (existing) {
        existing.addEventListener('load', init);
      } else {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        s.crossOrigin = '';
        s.setAttribute('data-leaflet', '1');
        s.onload = init;
        document.head.appendChild(s);
      }
    }

    return () => {
      try {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
          markersRef.current = {};
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = () => {
    onChange(Array.from(selSet));
    onClose();
  };

  const sortedSelected = Array.from(selSet).sort();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-stretch md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-4xl md:rounded-2xl flex flex-col h-full md:h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
          <div>
            <div className="font-semibold text-slate-900 text-sm">Pick neighborhoods on the map</div>
            <div className="text-xs text-slate-500">Tap a ZIP to select / deselect. {selSet.size} selected.</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 relative">
          <div ref={mapDivRef} className="absolute inset-0" />
        </div>
        {sortedSelected.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 max-h-32 overflow-y-auto shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Selected ZIPs</div>
            <div className="flex flex-wrap gap-1.5">
              {sortedSelected.map((z) => {
                const info = PHILLY_ZIPS.find((p) => p.zip === z);
                return (
                  <button
                    key={z}
                    onClick={() => toggle(z)}
                    className="px-2.5 py-1 rounded-full bg-slate-900 text-white text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-700"
                  >
                    {z}{info ? ` · ${info.name.split(' / ')[0]}` : ''} <X className="w-3 h-3" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave}>Use {selSet.size} {selSet.size === 1 ? 'ZIP' : 'ZIPs'}</Button>
        </div>
      </div>
    </div>
  );
}

// Picker for the "Preferred areas" intake step. Map-only — no free-text.
// Stores selected ZIPs as a comma-separated string in `lead.areas`, which is
// the shape `matchListings()` expects (it splits on comma/semicolon and
// matches each token against property.zip or property.neighborhood).
// Dual-range budget slider with snap-to-$100 increments.
// Renders min and max thumbs on top of a gradient track so the selected
// range is visually obvious. Falls back to plain inputs at tiny widths.
function BudgetRange({ min, max, onChange, lo = 500, hi = 5000, step = 100 }) {
  const minVal = Number(min) || lo;
  const maxVal = Number(max) || Math.min(hi, Math.max(lo + 500, minVal + 500));

  // Each thumb is independent. Enforce min ≤ max by clamping on change.
  const onMinChange = (e) => {
    const v = Number(e.target.value);
    onChange({ min: v, max: v > maxVal ? v : maxVal });
  };
  const onMaxChange = (e) => {
    const v = Number(e.target.value);
    onChange({ min: v < minVal ? v : minVal, max: v });
  };

  // Calculate selected-range overlay positions as percentages.
  const left = ((minVal - lo) / (hi - lo)) * 100;
  const right = 100 - ((maxVal - lo) / (hi - lo)) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Min</div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums">${minVal.toLocaleString()}</div>
        </div>
        <div className="text-slate-300 text-2xl">—</div>
        <div className="text-right">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Max</div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums">${maxVal.toLocaleString()}{maxVal >= hi ? '+' : ''}</div>
        </div>
      </div>

      {/* Slider track + dual thumbs */}
      <div className="relative h-7 mb-1 select-none">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-slate-200 rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-slate-900 rounded-full"
          style={{ left: `${left}%`, right: `${right}%` }}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={minVal}
          onChange={onMinChange}
          className="budget-range absolute inset-0 w-full appearance-none bg-transparent pointer-events-none"
          style={{ zIndex: 2 }}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={maxVal}
          onChange={onMaxChange}
          className="budget-range absolute inset-0 w-full appearance-none bg-transparent pointer-events-none"
          style={{ zIndex: 3 }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 font-medium tabular-nums">
        <span>${lo.toLocaleString()}</span>
        <span>${hi.toLocaleString()}+</span>
      </div>

      <style>{`
        /* WebKit thumb */
        .budget-range::-webkit-slider-thumb {
          appearance: none;
          width: 22px;
          height: 22px;
          background: #fff;
          border: 2.5px solid #0f172a;
          border-radius: 9999px;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12);
          margin-top: -10px;
        }
        .budget-range::-webkit-slider-runnable-track {
          height: 2px;
          background: transparent;
        }
        /* Firefox */
        .budget-range::-moz-range-thumb {
          width: 22px;
          height: 22px;
          background: #fff;
          border: 2.5px solid #0f172a;
          border-radius: 9999px;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        }
        .budget-range::-moz-range-track {
          height: 2px;
          background: transparent;
        }
      `}</style>
    </div>
  );
}

// Tour availability — multi-select chip picker. Stored as an array of strings
// in lead.tour_availability. The agent sees these windows in the lead detail
// when scheduling so they only offer slots that work for the lead.
// Specific, actionable showing windows. These map to times Morgan typically
// runs tours so the agent can book directly within a chosen window without
// going back to the lead. Each option is a concrete day + 2-hour block.
const TOUR_WINDOWS = [
  { id: 'tue-eve',    label: 'Tuesday evening',    sub: '5 – 7 PM' },
  { id: 'wed-eve',    label: 'Wednesday evening',  sub: '5 – 7 PM' },
  { id: 'thu-eve',    label: 'Thursday evening',   sub: '5 – 7 PM' },
  { id: 'fri-eve',    label: 'Friday evening',     sub: '5 – 7 PM' },
  { id: 'sat-am',     label: 'Saturday morning',   sub: '10 AM – 12 PM' },
  { id: 'sat-early',  label: 'Saturday early afternoon', sub: '12 – 2 PM' },
  { id: 'sat-late',   label: 'Saturday late afternoon',  sub: '2 – 4 PM' },
  { id: 'sun-early',  label: 'Sunday early afternoon',   sub: '12 – 2 PM' },
  { id: 'sun-late',   label: 'Sunday late afternoon',    sub: '2 – 4 PM' },
];

function TourAvailabilityPicker({ value, onChange }) {
  const selected = new Set(Array.isArray(value) ? value : []);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {TOUR_WINDOWS.map((w) => {
        const isOn = selected.has(w.id);
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => toggle(w.id)}
            className={`text-left px-4 py-3.5 rounded-2xl border-2 transition-all flex items-center gap-3 ${
              isOn
                ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${isOn ? 'bg-white' : 'border-2 border-slate-300'}`}>
              {isOn && <Check className="w-3.5 h-3.5 text-slate-900" strokeWidth={3} />}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm">{w.label}</div>
              <div className={`text-xs ${isOn ? 'text-white/70' : 'text-slate-500'}`}>{w.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AreasPicker({ value, onChange }) {
  const [mapOpen, setMapOpen] = useState(false);
  const currentZips = (value || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((t) => /^\d{5}$/.test(t));

  const handleMapSave = (zips) => onChange(zips.join(', '));
  const removeZip = (zip) => onChange(currentZips.filter((z) => z !== zip).join(', '));

  return (
    <div className="space-y-4">
      {/* Selected chips */}
      {currentZips.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {currentZips.length} {currentZips.length === 1 ? 'neighborhood' : 'neighborhoods'} selected
          </div>
          <div className="flex flex-wrap gap-2">
            {currentZips.map((z) => {
              const info = PHILLY_ZIPS.find((p) => p.zip === z);
              return (
                <button
                  key={z}
                  type="button"
                  onClick={() => removeZip(z)}
                  className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-900 inline-flex items-center gap-2 hover:border-slate-400 transition-colors"
                >
                  <span className="text-slate-400 text-xs tabular-nums">{z}</span>
                  <span className="truncate max-w-[180px]">{info ? info.name.split(' / ')[0] : 'Philly'}</span>
                  <X className="w-3 h-3 text-slate-400 hover:text-slate-700" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Primary map CTA. Big and obvious when nothing selected yet. */}
      <button
        type="button"
        onClick={() => setMapOpen(true)}
        className={`w-full rounded-2xl border-2 border-dashed transition-colors inline-flex items-center justify-center gap-3 ${
          currentZips.length > 0
            ? 'py-3.5 border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50 text-sm font-medium'
            : 'py-10 border-slate-300 text-slate-900 hover:border-slate-900 hover:bg-slate-50 text-base font-semibold'
        }`}
      >
        <MapPin className={currentZips.length > 0 ? 'w-4 h-4' : 'w-5 h-5'} />
        {currentZips.length > 0 ? 'Edit on map' : 'Pick neighborhoods on a map'}
      </button>

      {mapOpen && (
        <ZipMapPicker
          selected={currentZips}
          onChange={handleMapSave}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  );
}

function IntakeForm({ onSubmit, onBack }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    fullName: '', email: '', phone: '',
    moveInDate: '', budgetMin: '', budgetMax: '',
    beds: '1', baths: '1', areas: '',
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
      subtitle: 'Drag to set your monthly rent range.',
      valid: () => data.budgetMin && data.budgetMax && Number(data.budgetMax) >= Number(data.budgetMin),
      fields: (
        <BudgetRange
          min={data.budgetMin}
          max={data.budgetMax}
          onChange={({ min, max }) => setData({ ...data, budgetMin: String(min), budgetMax: String(max) })}
        />
      )
    },
    {
      title: 'How much space do you need?',
      subtitle: 'Pick the minimum you\'d consider.',
      valid: () => data.beds !== '' && data.baths !== '',
      fields: <BedBathSelector beds={data.beds || '1'} baths={data.baths || '1'} onChange={(patch) => setData({ ...data, ...patch })} />
    },
    {
      title: 'Where do you want to live?',
      subtitle: 'Tap ZIPs on the map, or type neighborhood names.',
      valid: () => true,
      fields: (
        <AreasPicker
          value={data.areas}
          onChange={(v) => update('areas', v)}
        />
      )
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
        {step === steps.length - 1 ? 'Send to my agent' : 'Continue'}
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
// Simple single-select bed/bath picker. One tap commits a value.
// Lead picks the minimum they'd consider (matches the way most rental
// search sites work — "show me 1+ beds" rather than a range).
function BedBathSelector({ beds, baths, onChange }) {
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

  const renderRow = (options, currentValue, onPick, Icon) => (
    <div className="grid grid-cols-5 gap-2">
      {options.map((o) => {
        const selected = currentValue === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            className={`flex flex-col items-center justify-center gap-1.5 py-5 rounded-2xl transition-all ${
              selected
                ? 'bg-slate-900 text-white shadow-lg scale-[1.03]'
                : 'bg-white text-slate-700 border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <Icon className={`w-5 h-5 ${selected ? 'text-white' : 'text-slate-400'}`} />
            <span className="text-base font-semibold">{o.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-end justify-between mb-3">
          <div className="text-sm font-semibold text-slate-900">Bedrooms</div>
          <div className="text-[11px] text-slate-500">Minimum you&apos;d consider</div>
        </div>
        {renderRow(bedOptions, beds, (v) => onChange({ beds: v }), Bed)}
      </div>

      <div>
        <div className="flex items-end justify-between mb-3">
          <div className="text-sm font-semibold text-slate-900">Bathrooms</div>
          <div className="text-[11px] text-slate-500">Minimum you&apos;d consider</div>
        </div>
        {renderRow(bathOptions, baths, (v) => onChange({ baths: v }), Bath)}
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

function ListingsView({ lead, properties, excludedBrokerages, brightPortalUrls, onBookTour, onDone }) {
  const matches = matchListings(lead, properties, excludedBrokerages).slice(0, MAX_PROPERTIES_PER_TOUR);
  const [selected, setSelected] = useState([]);
  const [photoModal, setPhotoModal] = useState(null);   // { listing, url } or null
  const firstName = lead.fullName.split(' ')[0];

  const toggle = (listing) => {
    if (selected.find(s => s.id === listing.id)) setSelected(selected.filter(s => s.id !== listing.id));
    else if (selected.length < MAX_PROPERTIES_PER_TOUR) setSelected([...selected, listing]);
  };
  const atLimit = selected.length >= MAX_PROPERTIES_PER_TOUR;

  // Pick the most relevant portal URL for a given listing. If we have only one
  // configured portal, use it. If multiple are configured, prefer one whose
  // associated neighborhood matches (Morgan can map portals → neighborhoods in
  // settings). For now: just use the first portal URL.
  const portalUrlFor = (l) => {
    const urls = Array.isArray(brightPortalUrls) ? brightPortalUrls : [];
    if (urls.length === 0) return null;
    return urls[0];   // future: smarter mapping by neighborhood/criteria
  };

  const openPhotos = (l, e) => {
    e?.stopPropagation();
    const url = portalUrlFor(l);
    if (!url) {
      window.alert('No BrightMLS portal configured yet. Ask your agent.');
      return;
    }
    // Some Matrix portal URLs accept &Display=... or &MLSNumber= for deep
    // links. We append the MLS as a hint — falls back to the portal home
    // gracefully if the param isn't supported.
    const deepLink = l.mls ? `${url}${url.includes('?') ? '&' : '?'}MLSNumber=${encodeURIComponent(l.mls)}` : url;
    setPhotoModal({ listing: l, url: deepLink });
  };

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
                <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
                  {l.image ? (
                    <img src={l.image} alt={l.address} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                      <Building2 className="w-8 h-8" />
                      <span className="text-xs">Photos in BrightMLS portal</span>
                    </div>
                  )}
                  {/* Photo button overlays the image */}
                  <button
                    onClick={(e) => openPhotos(l, e)}
                    className="absolute bottom-2 right-2 bg-white/95 backdrop-blur-sm text-slate-900 text-xs font-medium px-2.5 py-1.5 rounded-full shadow-sm hover:bg-white inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3 h-3" /> Photos
                  </button>
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
                    {l.sqft ? <span>{l.sqft} sqft</span> : null}
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
              {selected.slice(0, 4).map(s => s.image
                ? <img key={s.id} src={s.image} alt="" className="w-9 h-9 rounded-full border-2 border-white object-cover" />
                : <div key={s.id} className="w-9 h-9 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center"><Building2 className="w-3.5 h-3.5 text-slate-500" /></div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 text-sm">{selected.length} {selected.length === 1 ? 'property' : 'properties'} selected</div>
            </div>
            <Button iconRight={ArrowRight} onClick={() => onBookTour(selected)}>Book tour</Button>
          </div>
        </div>
      )}

      {photoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-stretch md:items-center justify-center p-0 md:p-6" onClick={() => setPhotoModal(null)}>
          <div className="bg-white w-full md:max-w-5xl md:rounded-2xl flex flex-col h-full md:h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 text-sm truncate">{photoModal.listing.address}</div>
                <div className="text-xs text-slate-500 truncate">
                  {photoModal.listing.neighborhood ? `${photoModal.listing.neighborhood} · ` : ''}
                  {fmtCurrency(photoModal.listing.price)}/mo · {photoModal.listing.beds === 0 ? 'Studio' : `${photoModal.listing.beds}bd`} · {photoModal.listing.baths}ba
                  {photoModal.listing.mls ? ` · ${photoModal.listing.mls}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <a
                  href={photoModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 hover:text-slate-900 underline inline-flex items-center gap-1"
                >
                  Open in new tab <ExternalLink className="w-3 h-3" />
                </a>
                <button onClick={() => setPhotoModal(null)} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <iframe
              src={photoModal.url}
              title={`Photos for ${photoModal.listing.address}`}
              className="flex-1 w-full border-0"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500">
                Photos hosted by BrightMLS.
                {photoModal.listing.mls ? ` Search MLS# ${photoModal.listing.mls} if you don't see this listing.` : ''}
              </div>
              <Button
                size="sm"
                onClick={() => {
                  toggle(photoModal.listing);
                  setPhotoModal(null);
                }}
                disabled={atLimit && !selected.find((s) => s.id === photoModal.listing.id)}
              >
                {selected.find((s) => s.id === photoModal.listing.id) ? 'Deselect' : 'Add to tour'}
              </Button>
            </div>
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

// Confirmation screen shown immediately after a lead submits intake.
// Communicates: (1) we got it, (2) your agent is hand-picking, (3) link is
// coming via SMS + email shortly. Replaces the previous "here are 8 matches"
// screen since real matched listings (with photos) require BrightMLS API
// access we don't have yet.
function CuratingConfirmed({ lead, agentName /* unused, onDone */ }) {
  const firstName = (lead.fullName || '').split(' ')[0] || 'there';
  const agentLabel = agentName && agentName !== '[Your name]' ? agentName : 'Your agent';
  const subline = `${agentLabel} is hand-picking rentals that match your criteria. Expect a personalized link by text and email within a few hours — you'll be able to pick which ones to tour and a time that works.`;

  // Pretty bed/bath summary — single value (minimum).
  const bedSummary = lead.beds === '0' ? 'Studio' : lead.beds === '4' ? '4+ bd' : `${lead.beds}+ bd`;
  const bathSummary = lead.baths === '3' ? '3+ ba' : `${lead.baths}+ ba`;

  return (
    <div className="max-w-xl mx-auto px-6 md:px-8 py-16">
      <div className="text-center mb-10">
        <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-6 h-6" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-3">
          Got it, {firstName}.
        </h1>
        <p className="text-slate-600 leading-relaxed max-w-md mx-auto">{subline}</p>
      </div>

      <Card className="p-5 mb-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Your search</div>
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <div>
            <div className="text-[11px] text-slate-500 mb-0.5">Move-in</div>
            <div className="font-medium text-slate-900">{fmtDate(lead.moveInDate)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-0.5">Budget</div>
            <div className="font-medium text-slate-900">${Number(lead.budgetMin || 0).toLocaleString()} – ${Number(lead.budgetMax || 0).toLocaleString()}/mo</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-0.5">Size</div>
            <div className="font-medium text-slate-900">{bedSummary} · {bathSummary}</div>
          </div>
          {lead.areas && (
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Neighborhoods</div>
              <div className="font-medium text-slate-900 truncate">{lead.areas}</div>
            </div>
          )}
        </div>
      </Card>

      {windows.length > 0 && (
        <Card className="p-5 mb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Tour windows you picked</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {windows.map((w) => (
              <div key={w.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{w.label}</div>
                  <div className="text-[11px] text-slate-500">{w.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="text-center text-xs text-slate-500 mt-6 leading-relaxed">
        Your link will arrive at <span className="text-slate-700 font-medium">{lead.email}</span><br />
        and by text to <span className="text-slate-700 font-medium">{lead.phone}</span>.
      </div>
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
  { id: 'new',            label: 'New',             tone: 'neutral' },
  { id: 'matched',        label: 'Link sent',       tone: 'info' },
  { id: 'tour-requested', label: 'Tour requested',  tone: 'warning' },
  { id: 'tour-booked',    label: 'Touring',         tone: 'info' },
  { id: 'post-tour',      label: 'Post-tour',       tone: 'info' },
  { id: 'applied',        label: 'Applied',         tone: 'accent' },
  { id: 'leased',         label: 'Leased',          tone: 'positive' },
  { id: 'paid',           label: 'Commission paid', tone: 'positive' },
  { id: 'lost',           label: 'Lost',            tone: 'danger' },
];

// When the user advances a lead to a stage, we auto-create useful follow-up
// tasks so nothing slips through the cracks.
function stageDefaultTasks(stage, lead, firstName) {
  const now = Date.now();
  const inDays = (n) => new Date(now + n * 86400000).toISOString().split('T')[0];
  switch (stage) {
    case 'applied':
      return [
        { id: `t_${now}_landlord3d`, lead_id: lead.id, title: `Follow up with landlord re: ${firstName}'s app — 3 days`,
          due_date: inDays(3), status: 'pending', priority: 'high', auto: true, flags: ['landlord-followup'] },
        { id: `t_${now}_landlord7d`, lead_id: lead.id, title: `Second follow-up with landlord re: ${firstName}'s app — 7 days`,
          due_date: inDays(7), status: 'pending', priority: 'medium', auto: true, flags: ['landlord-followup'] },
      ];
    case 'leased':
      return [
        { id: `t_${now}_movein`, lead_id: lead.id, title: `Confirm move-in details with ${firstName}`,
          due_date: inDays(2), status: 'pending', priority: 'high', auto: true, flags: ['move-in'] },
        { id: `t_${now}_invoice`, lead_id: lead.id, title: `Invoice landlord for ${firstName}'s commission`,
          due_date: inDays(3), status: 'pending', priority: 'high', auto: true, flags: ['commission'] },
      ];
    case 'paid':
      return [];
    case 'lost':
      return [];
    default:
      return [];
  }
}

const MESSAGE_TEMPLATES = {
  'check-in': { name: 'Check-in', subject: 'Quick check-in', body: 'Hi {firstName} — just checking in on your home search. Still looking in {areas}?' },
  'custom': { name: 'Custom message', subject: '', body: '' },
};

// ============================================================
// ADMIN LOGIN — email + password (default), magic-link fallback
// ============================================================
function AdminLogin() {
  // mode: 'password' (default) or 'magic' (fallback for forgot-password)
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (mode === 'password' && !password) return;
    setBusy(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    const result = mode === 'password'
      ? await signInWithPassword(cleanEmail, password)
      : await signInWithMagicLink(cleanEmail);
    setBusy(false);
    if (result.ok) {
      if (mode === 'magic') setMagicSent(true);
      // For password mode, onAuthChange listener will pick up the new session
      // and re-render the parent into the AdminCRM view automatically.
    } else {
      setError(result.error || 'Could not sign in');
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center mx-auto mb-5">
          <Shield className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Sign in to admin</h1>
        <p className="text-sm text-slate-500">
          {mode === 'password' ? 'Enter your email and password.' : 'We’ll email you a one-time sign-in link.'}
        </p>
      </div>

      {magicSent ? (
        <Card className="p-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
          <div className="font-semibold text-slate-900 mb-1">Check your inbox</div>
          <div className="text-sm text-slate-500">
            A sign-in link is on its way to <span className="font-medium text-slate-700">{email}</span>.
            Click it from this device.
          </div>
        </Card>
      ) : (
        <form onSubmit={onSubmit}>
          <Card className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Email</label>
              <input
                type="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                placeholder="you@example.com"
              />
            </div>
            {mode === 'password' && (
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                  placeholder="••••••••"
                />
              </div>
            )}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              {busy ? (mode === 'password' ? 'Signing in…' : 'Sending…') : (mode === 'password' ? 'Sign in' : 'Email me a magic link')}
            </button>
          </Card>
        </form>
      )}

      {!magicSent && (
        <p className="text-xs text-slate-500 text-center mt-5">
          {mode === 'password' ? (
            <>
              Forgot your password?{' '}
              <button
                type="button"
                onClick={() => { setMode('magic'); setError(null); }}
                className="underline hover:text-slate-700"
              >
                Email me a magic link instead
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setMode('password'); setError(null); }}
              className="underline hover:text-slate-700"
            >
              ← Back to password sign-in
            </button>
          )}
        </p>
      )}

      <p className="text-xs text-slate-400 text-center mt-6">
        Only allow-listed emails can access admin.
      </p>
    </div>
  );
}

// ============================================================
// ADMIN UNAUTHORIZED — signed in but not on the allow-list
// ============================================================
function AdminUnauthorized({ email }) {
  return (
    <div className="max-w-md mx-auto px-6 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-5">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-2">Access denied</h1>
      <p className="text-sm text-slate-500 mb-6">
        <span className="text-slate-700 font-medium">{email || 'This account'}</span> isn&apos;t on the admin allow-list.
      </p>
      <button
        onClick={async () => { await signOut(); }}
        className="px-5 py-2 rounded-full border border-slate-200 text-sm font-medium hover:border-slate-300 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

function AdminCRM({ leads, updateLead, saveLeads, slots, openSlot, closeSlot, waitlist, saveWaitlist, settings, saveSettings, subview, setSubview, selectedLeadId, setSelectedLeadId, showToast, timeOffset, saveTimeOffset, saveScreeningReport, saveApplicationFile, deleteApplicationFile, toggleApplicationReviewed, createSubmission, updateSubmissionStatus, logSubmissionFollowUp, sessionEmail, properties, saveProperty, removeProperty, bulkImportProperties }) {
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

  // Count of leads whose latest non-internal message is INBOUND — i.e., waiting
  // on your reply. Drives the gold badge on the Inbox tab.
  const needsReplyBadge = useMemo(() => {
    let n = 0;
    for (const l of leads) {
      const msgs = (l.messages || []).filter(m => !m.internal);
      const last = msgs[msgs.length - 1];
      if (last && last.direction === 'inbound') n++;
    }
    return n;
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
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className="pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-full focus:outline-none focus:border-slate-400 w-56" />
          </div>
          {sessionEmail && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">{sessionEmail}</span>
              <button
                onClick={async () => { await signOut(); }}
                className="px-3 py-1.5 rounded-full border border-slate-200 hover:border-slate-300 hover:text-slate-700 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5-tab top nav. Inbox is the default; everything else routes under here. */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto">
        {[
          { k: 'inbox', label: 'Inbox', icon: Inbox, badge: needsReplyBadge },
          { k: 'pipeline', label: 'Pipeline', icon: Activity, count: leads.filter(l => l.stage && !['lost', 'paid'].includes(l.stage)).length },
          { k: 'leads', label: 'Leads', icon: Users, count: leads.length },
          { k: 'tours', label: 'Tours', icon: CalendarDays, count: upcomingTours.length },
          { k: 'settings', label: 'Settings', icon: Settings },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setSubview(t.k)}
            className={`px-5 py-3 text-[15px] font-semibold transition-colors flex items-center gap-2.5 whitespace-nowrap border-b-2 -mb-px ${
              subview === t.k
                ? 'text-brand-ink border-brand-ink'
                : 'text-slate-500 border-transparent hover:text-slate-900'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.badge > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-gold)', color: 'white' }}>{t.badge}</span>}
            {!t.badge && t.count > 0 && <span className="text-[11px] text-slate-400 font-medium tabular-nums">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Today snapshot — always visible above the tab content for at-a-glance counts */}
      <TodayStrip
        metrics={metrics}
        upcomingTours={upcomingTours}
        overdueTasks={overdueTasks}
        todayTasks={todayTasks}
        leads={leads}
      />

      {subview === 'inbox' && <InboxView leads={leads} onSelectLead={setSelectedLeadId} updateLead={updateLead} settings={settings} showToast={showToast} />}
      {subview === 'pipeline' && (
        <PipelineView leads={leads} updateLead={updateLead} onSelectLead={setSelectedLeadId} showToast={showToast} />
      )}
      {subview === 'leads' && (
        <LeadsListView
          leads={leads}
          search={search}
          onSelectLead={setSelectedLeadId}
          saveLeads={saveLeads}
          waitlist={waitlist}
          allTasks={allTasks}
          updateLead={updateLead}
          showToast={showToast}
        />
      )}
      {subview === 'tours' && (
        <ToursSection
          upcomingTours={upcomingTours}
          leads={leads}
          settings={settings}
          onSelectLead={setSelectedLeadId}
          updateSubmissionStatus={updateSubmissionStatus}
          updateLead={updateLead}
          showToast={showToast}
        />
      )}
      {subview === 'settings' && (
        <SettingsSection
          settings={settings}
          saveSettings={saveSettings}
          showToast={showToast}
          properties={properties}
          saveProperty={saveProperty}
          removeProperty={removeProperty}
          bulkImportProperties={bulkImportProperties}
          leads={leads}
        />
      )}

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
          // Email — go through the server wrapper for delivery_status tracking.
          const emailResult = await sendEmail({
            leadId: lead.id,
            subject: msg.subject,
            body: msg.body,
            kind: 'manual',
            idempotencyKey: `manual-email-${lead.id}-${Date.now()}`,
            automated: false,
          });
          if (!emailResult.ok) {
            showToast(`Email not sent — ${emailResult.error || 'send failed'}`);
            setComposeModal(null);
            return;
          }
          newMsg = emailResult.message ? {
            id: emailResult.message.id,
            channel: 'email',
            direction: 'outbound',
            status: emailResult.message.status || 'sent',
            to: emailResult.message.to,
            via: 'resend',
            subject: emailResult.message.subject,
            body: emailResult.message.body,
            timestamp: emailResult.message.created_at || new Date().toISOString(),
            automated: false,
          } : {
            id: `m_${Date.now()}`, channel: 'email', direction: 'outbound', status: 'sent',
            to: lead.email, via: 'resend',
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
function LeadsListView({ leads, search, onSelectLead, saveLeads, waitlist = [], allTasks, updateLead, showToast }) {
  const [bucketFilter, setBucketFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('active');  // 'active' = not leased/lost/archived

  // Stages that actually appear in this list of leads — derived so the chips
  // only show options that match real data.
  const availableStages = useMemo(() => {
    const set = new Set(leads.map(l => l.stage).filter(Boolean));
    return Array.from(set);
  }, [leads]);

  const filtered = leads.filter(l => {
    const matchBucket = bucketFilter === 'all' || l.bucket === bucketFilter;
    const matchStage =
      stageFilter === 'all' ? true :
      stageFilter === 'active' ? !['leased', 'lost', 'archived'].includes(l.stage) :
      l.stage === stageFilter;
    const matchSearch = !search || l.fullName.toLowerCase().includes(search.toLowerCase()) || l.email.toLowerCase().includes(search.toLowerCase());
    return matchBucket && matchStage && matchSearch;
  });

  const waitlistedLeadIds = new Set(waitlist.filter(w => w.status === 'waiting').map(w => w.leadId));

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mr-1">Bucket</span>
        {['all', 'GCMS', 'GCM75+', 'BCMS', 'BC75+'].map(k => (
          <button key={k} onClick={() => setBucketFilter(k)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${bucketFilter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{k === 'all' ? 'All' : k}</button>
        ))}
        {leads.length > 0 && (
          <button onClick={() => { if (confirm('Clear all leads?')) saveLeads([]); }} className="ml-auto text-xs text-slate-400 hover:text-red-600">Clear all</button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mr-1 ml-5">Stage</span>
        {['active', 'all', ...availableStages].filter((v, i, a) => a.indexOf(v) === i).map(k => {
          const label = k === 'all' ? 'All' : k === 'active' ? 'Active' : (PIPELINE_STAGES.find(s => s.id === k)?.label || k);
          return (
            <button key={k} onClick={() => setStageFilter(k)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${stageFilter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>
          );
        })}
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
          {lead.opted_out && <Pill tone="danger" icon={Shield}>Opted out</Pill>}
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
function ToursView({ upcomingTours, onSelectLead, updateLead, showToast }) {
  if (upcomingTours.length === 0) return <EmptyState icon={CalendarDays} title="No scheduled tours" desc="Tours will appear here." />;

  // Mark a tour with an outcome. Also creates a follow-up task appropriate
  // to the outcome so nothing falls through the cracks.
  const setOutcome = async (tour, outcome) => {
    const lead = tour.lead;
    if (!lead) return;
    const updatedTours = (lead.tours || []).map(t =>
      t.id === tour.id
        ? { ...t, status: outcome === 'showed' ? 'completed' : outcome === 'no-show' ? 'no-show' : 'cancelled',
            outcome, completedAt: new Date().toISOString() }
        : t
    );
    // Auto-create the right follow-up task based on outcome.
    const firstAddr = (tour.listings || [])[0]?.address || 'the property';
    let followUpTask = null;
    if (outcome === 'showed') {
      followUpTask = {
        id: `t_${Date.now()}_post`,
        title: `Post-tour follow-up with ${lead.fullName.split(' ')[0]} re: ${firstAddr}`,
        dueDate: new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0],
        status: 'pending', auto: true, priority: 'high', flags: ['post-tour-followup'],
      };
    } else if (outcome === 'no-show') {
      followUpTask = {
        id: `t_${Date.now()}_noshow`,
        title: `Re-engage ${lead.fullName.split(' ')[0]} — they no-showed ${firstAddr}`,
        dueDate: new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0],
        status: 'pending', auto: true, priority: 'medium', flags: ['no-show-followup'],
      };
    }
    const next = {
      tours: updatedTours,
      activities: [...(lead.activities || []), {
        id: `a_${Date.now()}`,
        type: `tour-${outcome}`,
        timestamp: new Date().toISOString(),
        message: `Tour ${outcome}: ${firstAddr}`,
      }],
    };
    if (followUpTask) next.tasks = [...(lead.tasks || []), followUpTask];
    // Stage progression
    if (outcome === 'showed' && (lead.stage === 'tour-booked' || lead.stage === 'tour-requested')) {
      next.stage = 'post-tour';
    }
    await updateLead(lead.id, next);
    showToast(outcome === 'showed' ? 'Marked showed · follow-up task added' : outcome === 'no-show' ? 'No-show recorded' : 'Tour cancelled');
  };

  return (
    <div className="space-y-3">
      {upcomingTours.map(t => {
        const props = t.listings || [];
        const d = new Date(t.date + 'T00:00:00');
        const tourEnd = parseSlotDateTime({ date: t.date, time: t.time });
        if (tourEnd) tourEnd.setHours(tourEnd.getHours() + 1);
        const isPast = tourEnd && new Date() > tourEnd;
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
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {t.tourType === 'virtual' && <Pill icon={Video}>Virtual</Pill>}
                {isPast && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOutcome(t, 'showed'); }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                    >
                      ✓ Showed
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOutcome(t, 'no-show'); }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                    >
                      No-show
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOutcome(t, 'cancelled'); }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                    >
                      Cancelled
                    </button>
                  </>
                )}
              </div>
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
// ============================================================
// SHIFT-BASED AVAILABILITY EDITOR
// Calendar grid for the next N weeks; click a day to add shifts.
// Optional weekly template auto-fills the next 4 weeks.
// ============================================================
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_HOURS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM',
];

// HH:MM (24h) → "5:00 PM"
function fmt24to12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
// "5:00 PM" → "17:00"
function fmt12to24(label) {
  if (!label) return '';
  const [time, ampm] = label.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}
// Split a shift {date, start, end} into 1-hour slot objects {id, date, time}.
function shiftToSlots(shift) {
  const out = [];
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  for (let cur = startMin; cur + 60 <= endMin; cur += 60) {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    const label = fmt24to12(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    out.push({
      id: `${shift.date}_${label.replace(/[:\s]/g, '')}`,
      date: shift.date,
      time: label,
    });
  }
  return out;
}
// All bookable slots from all shifts (used by ShiftEditor preview + curated API).
function shiftsToSlots(shifts, blockedDates = []) {
  const blocked = new Set(blockedDates);
  return (shifts || [])
    .filter((s) => !blocked.has(s.date))
    .flatMap(shiftToSlots);
}

// Generate the next `weeks` worth of shifts from a weekly template, skipping
// any date that already has shifts (preserves manual overrides).
function applyWeeklyTemplate(template, existingShifts, weeks = 4) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const existingDates = new Set((existingShifts || []).map((s) => s.date));
  const out = [...(existingShifts || [])];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    if (existingDates.has(dateStr)) continue;
    const dow = d.getDay();
    const ranges = template?.[dow] || template?.[String(dow)] || [];
    for (const r of ranges) {
      out.push({
        id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: dateStr,
        start: r.start,
        end: r.end,
      });
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
}

// Build a 4-week calendar grid (Sun-first weeks) starting from today's week.
function buildCalendarWeeks(numWeeks = 4, weekOffset = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Find the Sunday of this week, then shift by the requested week offset.
  const firstSun = new Date(today);
  firstSun.setDate(today.getDate() - today.getDay() + weekOffset * 7);
  const weeks = [];
  for (let w = 0; w < numWeeks; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(firstSun);
      date.setDate(firstSun.getDate() + w * 7 + d);
      days.push(date);
    }
    weeks.push(days);
  }
  return weeks;
}

// "May 17 – Jun 13, 2026" — works across month + year boundaries.
function calendarRangeLabel(weeks) {
  if (!weeks?.length) return '';
  const first = weeks[0][0];
  const last = weeks[weeks.length - 1][6];
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();
  const opts = { month: 'short', day: 'numeric' };
  const firstLabel = first.toLocaleDateString('en-US', opts);
  const lastLabel = sameMonth
    ? last.getDate()
    : last.toLocaleDateString('en-US', opts);
  return `${firstLabel} – ${lastLabel}, ${last.getFullYear()}`;
}

// Header row component for navigating the calendar.
function CalendarNav({ rangeLabel, onPrev, onNext, onToday, extra }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={onPrev} className="w-7 h-7 rounded-full border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center" title="Previous 4 weeks">
        <ChevronRight className="w-4 h-4 rotate-180" />
      </button>
      <button onClick={onToday} className="px-3 py-1 rounded-full border border-slate-200 hover:bg-slate-50 text-xs font-medium">
        Today
      </button>
      <button onClick={onNext} className="w-7 h-7 rounded-full border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center" title="Next 4 weeks">
        <ChevronRight className="w-4 h-4" />
      </button>
      <div className="font-semibold text-sm text-slate-900 ml-2">{rangeLabel}</div>
      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  );
}

function ShiftEditor({ value, onChange, tours = [] }) {
  const shifts = value?.shifts || [];
  const blocked = value?.blocked_dates || [];
  const template = value?.weekly_template || {};
  const [editingDate, setEditingDate] = useState(null); // YYYY-MM-DD
  const [showTemplate, setShowTemplate] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const weeks = useMemo(() => buildCalendarWeeks(4, weekOffset), [weekOffset]);
  const rangeLabel = useMemo(() => calendarRangeLabel(weeks), [weeks]);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isBlocked = (d) => blocked.includes(d);

  // Index shifts + tours by date for quick lookup.
  const shiftsByDate = useMemo(() => {
    const m = {};
    for (const s of shifts) (m[s.date] = m[s.date] || []).push(s);
    return m;
  }, [shifts]);
  const toursByDate = useMemo(() => {
    const m = {};
    for (const t of tours) {
      if (!t.date) continue;
      if (t.status === 'cancelled') continue;
      (m[t.date] = m[t.date] || []).push(t);
    }
    return m;
  }, [tours]);

  const addShift = (date, start, end) => {
    const newShift = { id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, date, start, end };
    const next = [...shifts, newShift].sort((a, b) =>
      a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)
    );
    onChange({ ...value, shifts: next });
  };
  const removeShift = (id) => {
    onChange({ ...value, shifts: shifts.filter((s) => s.id !== id) });
  };
  const toggleBlocked = (date) => {
    const next = isBlocked(date) ? blocked.filter((d) => d !== date) : [...blocked, date].sort();
    onChange({ ...value, blocked_dates: next });
  };
  const fillFromTemplate = () => {
    const next = applyWeeklyTemplate(template, shifts, 4);
    onChange({ ...value, shifts: next });
  };
  const clearFuture = () => {
    const next = shifts.filter((s) => s.date < todayStr);
    onChange({ ...value, shifts: next });
  };
  const updateTemplate = (dow, idx, key, val) => {
    const list = (template[dow] || []).slice();
    list[idx] = { ...list[idx], [key]: val };
    onChange({ ...value, weekly_template: { ...template, [dow]: list } });
  };
  const addTemplateRange = (dow) => {
    const list = (template[dow] || []).slice();
    list.push({ start: '09:00', end: '12:00' });
    onChange({ ...value, weekly_template: { ...template, [dow]: list } });
  };
  const removeTemplateRange = (dow, idx) => {
    const list = (template[dow] || []).filter((_, i) => i !== idx);
    onChange({ ...value, weekly_template: { ...template, [dow]: list } });
  };

  return (
    <Card className="p-5 space-y-5">
      <SectionHeader icon={CalendarDays}>Tour availability</SectionHeader>
      <div className="text-sm text-slate-600 leading-relaxed">
        Add specific dates and shifts when you can run tours. When you send a curated link,
        the lead sees these exact windows split into 1-hour slots. Click any day to add a shift,
        or use the weekly template to auto-fill the next 4 weeks in one click.
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={fillFromTemplate} icon={Calendar}>Apply weekly template (4 weeks)</Button>
        <Button size="sm" variant="secondary" onClick={() => setShowTemplate(!showTemplate)}>
          {showTemplate ? 'Hide' : 'Edit'} weekly template
        </Button>
        {shifts.some((s) => s.date >= todayStr) && (
          <Button size="sm" variant="secondary" onClick={clearFuture}>Clear all future shifts</Button>
        )}
      </div>

      {showTemplate && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Weekly template</div>
          {DAYS.map((dayLabel, dow) => {
            const ranges = template[dow] || [];
            return (
              <div key={dow} className="flex items-start gap-3">
                <div className="w-10 text-xs font-semibold text-slate-700 pt-1.5">{dayLabel}</div>
                <div className="flex-1 space-y-1.5">
                  {ranges.length === 0 && <div className="text-xs italic text-slate-400 py-1.5">No shifts</div>}
                  {ranges.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input type="time" value={r.start} onChange={(e) => updateTemplate(dow, idx, 'start', e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1" />
                      <span className="text-xs text-slate-400">to</span>
                      <input type="time" value={r.end} onChange={(e) => updateTemplate(dow, idx, 'end', e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1" />
                      <button type="button" onClick={() => removeTemplateRange(dow, idx)} className="text-slate-400 hover:text-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addTemplateRange(dow)} className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
                    <Plus className="w-3 h-3" /> add shift
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CALENDAR GRID */}
      <div>
        <div className="mb-3">
          <CalendarNav
            rangeLabel={rangeLabel}
            onPrev={() => setWeekOffset(weekOffset - 4)}
            onNext={() => setWeekOffset(weekOffset + 4)}
            onToday={() => setWeekOffset(0)}
          />
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-[10px] uppercase tracking-wider text-slate-400 text-center font-semibold py-1">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
            {week.map((d, di) => {
              const dateStr = d.toISOString().slice(0, 10);
              const isPast = dateStr < todayStr;
              const isToday = dateStr === todayStr;
              const dayShifts = shiftsByDate[dateStr] || [];
              const dayTours = toursByDate[dateStr] || [];
              const blockedDay = isBlocked(dateStr);
              // Show month label on day 1 OR on the first cell of the entire grid.
              const isMonthStart = d.getDate() === 1 || (wi === 0 && di === 0);
              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isPast}
                  onClick={() => setEditingDate(dateStr)}
                  className={`min-h-[78px] rounded-lg p-1.5 text-left border transition-colors ${
                    isPast ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed' :
                    blockedDay ? 'bg-red-50 border-red-200 hover:border-red-300' :
                    dayShifts.length > 0 ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-300' :
                    'bg-white border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-semibold ${isToday ? 'text-brand-gold' : ''}`}>
                      {isMonthStart
                        ? `${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getDate()}`
                        : d.getDate()}
                    </span>
                    {dayTours.length > 0 && (
                      <span className="text-[9px] bg-blue-600 text-white rounded-full px-1.5 leading-tight">{dayTours.length}</span>
                    )}
                  </div>
                  {blockedDay ? (
                    <div className="text-[9px] text-red-700 mt-1">Off</div>
                  ) : (
                    <div className="space-y-0.5 mt-1">
                      {dayShifts.slice(0, 2).map((s) => (
                        <div key={s.id} className="text-[9px] bg-emerald-200 text-emerald-900 rounded px-1 py-px truncate">
                          {fmt24to12(s.start).replace(':00', '')}–{fmt24to12(s.end).replace(':00', '')}
                        </div>
                      ))}
                      {dayShifts.length > 2 && (
                        <div className="text-[9px] text-emerald-700">+{dayShifts.length - 2} more</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* DATE EDITOR MODAL */}
      {editingDate && (
        <DateShiftModal
          date={editingDate}
          shifts={shiftsByDate[editingDate] || []}
          isBlocked={isBlocked(editingDate)}
          onClose={() => setEditingDate(null)}
          onAddShift={(start, end) => addShift(editingDate, start, end)}
          onRemoveShift={removeShift}
          onToggleBlocked={() => toggleBlocked(editingDate)}
        />
      )}
    </Card>
  );
}

function DateShiftModal({ date, shifts, isBlocked, onClose, onAddShift, onRemoveShift, onToggleBlocked }) {
  const [start, setStart] = useState('17:00');
  const [end, setEnd] = useState('19:00');
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const add = () => {
    if (!start || !end || start >= end) return;
    onAddShift(start, end);
    setStart(end);
    setEnd('');
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{dateLabel}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        {isBlocked ? (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            This day is marked off. Any shifts you add won&apos;t appear to leads until you unblock it.
          </div>
        ) : null}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Shifts</div>
          {shifts.length === 0 ? (
            <div className="text-sm italic text-slate-400 py-2">No shifts yet.</div>
          ) : (
            <div className="space-y-1.5">
              {shifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <div className="text-sm font-medium text-emerald-900">
                    {fmt24to12(s.start)} – {fmt24to12(s.end)}
                    <span className="text-xs text-emerald-700 ml-2">
                      ({Math.max(0, Math.floor((parseInt(s.end.split(':')[0]) * 60 + parseInt(s.end.split(':')[1]) - parseInt(s.start.split(':')[0]) * 60 - parseInt(s.start.split(':')[1])) / 60))} hrs)
                    </span>
                  </div>
                  <button onClick={() => onRemoveShift(s.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Add a shift</div>
          <div className="flex items-center gap-2">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="form-input flex-1" />
            <span className="text-xs text-slate-400">to</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="form-input flex-1" />
            <Button size="sm" onClick={add} disabled={!start || !end || start >= end}>Add</Button>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
          <button onClick={onToggleBlocked} className={`text-xs font-medium px-3 py-1.5 rounded-full ${isBlocked ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {isBlocked ? 'Unblock this day' : 'Mark day off'}
          </button>
          <Button size="sm" variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

// Keep legacy name as alias so existing call sites compile during migration.
function AvailabilityEditor({ value, onChange, tours }) {
  return <ShiftEditor value={value} onChange={onChange} tours={tours} />;
}

function SettingsView({ settings, saveSettings, showToast, tours, onEditTemplates }) {
  const [form, setForm] = useState(settings);
  const update = (k, v) => setForm({ ...form, [k]: v });
  const updateAutomation = (k, v) => setForm({ ...form, automation: { ...form.automation, [k]: v } });
  const updateAvailability = (next) => setForm({ ...form, agent_availability: next });
  const save = async () => { await saveSettings(form); showToast('Settings saved'); };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="divide-y divide-slate-100 overflow-hidden">
        <div className="p-5">
          <SectionHeader icon={Bot}>Automation</SectionHeader>
          <div className="text-sm text-slate-500 leading-relaxed">
            Every toggle below controls a specific automated behavior. Turn the master switch off to pause everything at once. Individual switches let you keep some automation running while disabling others.
          </div>
        </div>
        <AutomationRow
          name="Master switch"
          desc="Pause ALL automated behaviors at once. With this off, no welcome messages, no tour reminders, no post-tour nudges, no follow-ups, no daily summary email — everything below is suspended. Turn on to resume."
          value={form.automation?.enabled !== false}
          onChange={(v) => updateAutomation('enabled', v)}
        />
        <AutomationRow
          name="Welcome messages"
          desc="When a new lead submits the intake form, automatically send them a category-specific SMS + email within 30 seconds. Different message templates fire based on the lead's bucket (good/limited credit × moving soon/later)."
          value={form.automation?.welcomeMessages !== false}
          onChange={(v) => updateAutomation('welcomeMessages', v)}
          disabled={form.automation?.enabled === false}
          onEdit={onEditTemplates ? () => onEditTemplates('GCMS') : undefined}
          editLabel="Edit message templates →"
        />
        <AutomationRow
          name="Tour reminders"
          desc="Automatically text the lead a reminder 24 hours and 1 hour before each scheduled tour. Runs server-side every minute, so reminders fire on time even if you're not in the app."
          value={form.automation?.tourReminders !== false}
          onChange={(v) => updateAutomation('tourReminders', v)}
          disabled={form.automation?.enabled === false}
        />
        <AutomationRow
          name="Auto-complete tours"
          desc="Mark a tour as 'completed' automatically once its scheduled end time has passed. You can still override by clicking Showed / No-show / Cancelled in the Tours tab to track the actual outcome."
          value={form.automation?.autoCompleteTours !== false}
          onChange={(v) => updateAutomation('autoCompleteTours', v)}
          disabled={form.automation?.enabled === false}
        />
        <AutomationRow
          name="Re-engage silent leads"
          desc="If a lead goes quiet at a key step (got the curated link but hasn't picked properties at 48h; got the scheduling link but hasn't picked times at 48h; post-tour silence at 48h and 5 days) — automatically text a friendly nudge. Each lead gets each nudge once."
          value={form.automation?.autoNudgeNoResponse !== false}
          onChange={(v) => updateAutomation('autoNudgeNoResponse', v)}
          disabled={form.automation?.enabled === false}
        />
        <AutomationRow
          name="Daily morning summary"
          desc="At 7 AM ET each day, email you a brief listing: new leads needing curation, leads who requested tours, conversations awaiting your reply, today's + tomorrow's tours, and overdue tasks. Sends to morganrentalsphilly@gmail.com."
          value={form.automation?.dailySummary !== false}
          onChange={(v) => updateAutomation('dailySummary', v)}
          disabled={form.automation?.enabled === false}
        />
        <AutomationRow
          name="Auto-archive stale leads"
          desc="After 30 days of no activity (no messages from you OR them), automatically move the lead to 'archived' so they fall out of the active inbox. They stay in the database — you can always un-archive."
          value={form.automation?.autoArchiveStale !== false}
          onChange={(v) => updateAutomation('autoArchiveStale', v)}
          disabled={form.automation?.enabled === false}
        />
      </Card>

      <AvailabilityEditor
        value={form.agent_availability || DEFAULT_AGENT_SETTINGS.agent_availability}
        onChange={updateAvailability}
        tours={tours}
      />

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

function AutomationRow({ name, desc, value, onChange, disabled, onEdit, editLabel }) {
  return (
    <div className={`flex items-start gap-3 p-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 text-sm mb-0.5">{name}</div>
        <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="mt-2 text-[11px] font-medium text-slate-700 hover:text-slate-900 underline inline-flex items-center gap-1"
          >
            <Edit3 className="w-3 h-3" /> {editLabel || 'Edit templates'}
          </button>
        )}
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
// Curated-link panel — the agent's primary action for a new lead.
// Two inputs:
//   1. BrightMLS portal URL (lead sees this in iframe to browse photos)
//   2. Addresses — one per line (lead checks the ones they want to tour)
// On send: app SMSes + emails the lead a branded /c/[token] page.
// Commission tracking panel — shows only after the lead has reached `applied`
// or later (since that's when commission becomes a real conversation).
// Stored in lead.raw.commission so no migration needed.
function CommissionPanel({ lead, updateLead, showToast }) {
  const initial = lead.raw?.commission || { amount: '', status: 'pending', notes: '' };
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);

  // Show only for stages where commission is relevant.
  const eligibleStages = ['applied', 'leased', 'paid'];
  if (!eligibleStages.includes(lead.stage)) return null;

  const save = async (nextDraft) => {
    await updateLead(lead.id, {
      raw: { ...(lead.raw || {}), commission: nextDraft },
      activities: [...(lead.activities || []), {
        id: `a_${Date.now()}`,
        type: 'commission-update',
        timestamp: new Date().toISOString(),
        message: `Commission ${nextDraft.status}${nextDraft.amount ? ` · $${Number(nextDraft.amount).toLocaleString()}` : ''}`,
      }],
    });
    setDraft(nextDraft);
    setEditing(false);
    showToast('Commission updated');
  };

  const markStatus = async (status) => {
    const next = {
      ...draft,
      status,
      ...(status === 'invoiced' && !draft.invoiced_at ? { invoiced_at: new Date().toISOString() } : {}),
      ...(status === 'received' && !draft.received_at ? { received_at: new Date().toISOString() } : {}),
    };
    await save(next);
    // If marked received, auto-advance stage to paid.
    if (status === 'received' && lead.stage !== 'paid') {
      await updateLead(lead.id, { stage: 'paid' });
    }
  };

  const statusTone = {
    pending:  { bg: 'bg-slate-50',    border: 'border-slate-200',    text: 'text-slate-700',    label: 'Pending invoice' },
    invoiced: { bg: 'bg-amber-50',    border: 'border-amber-200',    text: 'text-amber-700',    label: 'Invoiced — awaiting payment' },
    received: { bg: 'bg-emerald-50',  border: 'border-emerald-200',  text: 'text-emerald-700',  label: 'Received ✓' },
  }[draft.status] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', label: draft.status };

  return (
    <Card className={`p-5 space-y-3 border-2 ${statusTone.bg} ${statusTone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Commission
          </div>
          <div className={`text-xs mt-0.5 ${statusTone.text}`}>{statusTone.label}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            ${draft.amount ? Number(draft.amount).toLocaleString() : '—'}
          </div>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Amount</label>
            <input
              type="number"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              placeholder="2400"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Notes (optional)</label>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
              placeholder="e.g. 1 month rent split 60/40"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setDraft(initial); setEditing(false); }}>Cancel</Button>
            <Button size="sm" onClick={() => save(draft)}>Save</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => markStatus('invoiced')}
              disabled={draft.status === 'invoiced' || draft.status === 'received'}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-40"
            >
              Mark invoiced
            </button>
            <button
              onClick={() => markStatus('received')}
              disabled={draft.status === 'received'}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40"
            >
              Mark received
            </button>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {draft.amount ? 'Edit' : 'Set amount'}
          </Button>
        </div>
      )}

      {(draft.invoiced_at || draft.received_at) && (
        <div className="text-[11px] text-slate-500 space-y-0.5">
          {draft.invoiced_at && <div>Invoiced {new Date(draft.invoiced_at).toLocaleDateString()}</div>}
          {draft.received_at && <div>Received {new Date(draft.received_at).toLocaleDateString()}</div>}
        </div>
      )}
      {draft.notes && <div className="text-[12px] italic text-slate-600">{draft.notes}</div>}
    </Card>
  );
}

// Summary card showing YTD + outstanding commissions. Lives at the top of
// the Settings tab as well as on the Inbox dashboard (when there's data).
function CommissionSummary({ leads }) {
  const stats = useMemo(() => {
    let received = 0, invoiced = 0, pending = 0;
    let receivedYTD = 0;
    const year = new Date().getFullYear();
    for (const l of leads) {
      const c = l.raw?.commission;
      if (!c || !c.amount) continue;
      const amt = Number(c.amount) || 0;
      if (c.status === 'received') {
        received += amt;
        if (c.received_at && new Date(c.received_at).getFullYear() === year) {
          receivedYTD += amt;
        }
      } else if (c.status === 'invoiced') {
        invoiced += amt;
      } else {
        pending += amt;
      }
    }
    return { received, invoiced, pending, receivedYTD };
  }, [leads]);

  if (stats.received + stats.invoiced + stats.pending === 0) return null;

  return (
    <Card className="p-5">
      <SectionHeader icon={DollarSign}>Commissions</SectionHeader>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">Received YTD</div>
          <div className="text-xl font-bold tabular-nums text-emerald-900">${stats.receivedYTD.toLocaleString()}</div>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">Invoiced</div>
          <div className="text-xl font-bold tabular-nums text-amber-900">${stats.invoiced.toLocaleString()}</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Pending</div>
          <div className="text-xl font-bold tabular-nums text-slate-700">${stats.pending.toLocaleString()}</div>
        </div>
      </div>
    </Card>
  );
}

// One-click stage selector that lives in the lead detail header.
// Changing stage:
//   - updates lead.stage
//   - logs an activity
//   - auto-creates relevant follow-up tasks (see stageDefaultTasks)
function StageDropdown({ lead, updateLead, showToast }) {
  const [open, setOpen] = useState(false);
  const currentStage = PIPELINE_STAGES.find(s => s.id === (lead.stage || 'new')) || PIPELINE_STAGES[0];
  const toneClass = {
    neutral:  'bg-slate-100 text-slate-700 border-slate-200',
    info:     'bg-blue-50 text-blue-700 border-blue-200',
    warning:  'bg-amber-50 text-amber-700 border-amber-200',
    positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    danger:   'bg-red-50 text-red-700 border-red-200',
    accent:   'bg-violet-50 text-violet-700 border-violet-200',
  }[currentStage.tone] || 'bg-slate-100 text-slate-700 border-slate-200';

  const setStage = async (newStageId) => {
    setOpen(false);
    if (newStageId === lead.stage) return;
    const firstName = (lead.fullName || '').split(' ')[0] || 'lead';
    const newTasks = stageDefaultTasks(newStageId, lead, firstName);
    await updateLead(lead.id, {
      stage: newStageId,
      activities: [...(lead.activities || []), {
        id: `a_${Date.now()}`,
        type: 'stage-change',
        timestamp: new Date().toISOString(),
        message: `Stage → ${PIPELINE_STAGES.find(s => s.id === newStageId)?.label || newStageId}`,
      }],
      ...(newTasks.length > 0 ? { tasks: [...(lead.tasks || []), ...newTasks] } : {}),
    });
    showToast(`Stage → ${PIPELINE_STAGES.find(s => s.id === newStageId)?.label}${newTasks.length > 0 ? ` · ${newTasks.length} task${newTasks.length === 1 ? '' : 's'} added` : ''}`);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-3 py-1 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 hover:opacity-80 ${toneClass}`}
      >
        {currentStage.label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 py-1 w-52 max-h-72 overflow-y-auto">
            {PIPELINE_STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStage(s.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${
                  s.id === lead.stage ? 'font-semibold text-slate-900' : 'text-slate-700'
                }`}
              >
                {s.label}
                {s.id === lead.stage && <Check className="w-3.5 h-3.5 text-emerald-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Shown after lead submits phase 1 — agent reviews their property picks
// and clicks "Send scheduling link" to enable phase 2 (the time picker).
function SchedulingLinkPanel({ lead, updateLead, showToast }) {
  const [busy, setBusy] = useState(false);
  const picks = Array.isArray(lead.raw?.curated_address_picks) ? lead.raw.curated_address_picks : [];
  const note = lead.raw?.curated_note;
  const schedulingSent = !!lead.raw?.scheduling_open_at;
  const timesSubmitted = !!lead.raw?.times_submitted_at;
  const firstName = (lead.fullName || '').split(' ')[0];
  const curatedUrl = lead.curatedLinkUrl || (lead.raw?.curated_token
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://rentalsphilly.vercel.app'}/c/${lead.raw.curated_token}`
    : null);

  if (picks.length === 0) return null;   // hidden until lead picks properties

  const onSend = async () => {
    if (!curatedUrl) {
      showToast('No curated link token found');
      return;
    }
    setBusy(true);
    const smsBody = `Rentals Philly: I checked availability — pick your tour times here: ${curatedUrl}`;
    const emailSubject = 'Pick your tour times';
    const emailBody =
      `Hi ${firstName},\n\n` +
      `Good news — the properties you picked are available. Click below to pick a tour time for each:\n\n` +
      `${curatedUrl}\n\n` +
      `— Morgan`;
    try {
      const smsResult = await sendSMS({
        leadId: lead.id,
        body: smsBody,
        kind: 'manual',
        idempotencyKey: `scheduling-link-${lead.id}-${Date.now()}`,
        automated: false,
      });
      if (!smsResult.ok && smsResult.error !== 'opted_out') {
        showToast(`SMS not sent — ${smsResult.error || 'send failed'}`);
        setBusy(false);
        return;
      }
      await sendEmail({
        leadId: lead.id,
        subject: emailSubject,
        body: emailBody,
        kind: 'manual',
        idempotencyKey: `scheduling-link-email-${lead.id}-${Date.now()}`,
        automated: false,
      });
      await updateLead(lead.id, {
        raw: {
          ...(lead.raw || {}),
          scheduling_open_at: new Date().toISOString(),
        },
        activities: [...(lead.activities || []), {
          id: `a_${Date.now()}`,
          type: 'scheduling-link-sent',
          timestamp: new Date().toISOString(),
          message: `Scheduling link sent to ${firstName} (${picks.length} properties)`,
        }],
      });
      showToast('Scheduling link sent');
    } catch (err) {
      console.error('[scheduling link] send failed', err);
      showToast('Send failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 space-y-4 border-2" style={{ backgroundColor: 'var(--brand-gold-soft)', borderColor: 'var(--brand-gold)' }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: 'var(--brand-gold)' }}>
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {timesSubmitted ? 'Lead picked tour times' : schedulingSent ? 'Scheduling link sent · waiting on lead' : 'Lead picked properties — review & send scheduling link'}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            Submitted {lead.raw?.curated_submitted_at ? new Date(lead.raw.curated_submitted_at).toLocaleString() : 'recently'}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-3 border border-slate-200">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
          Picks ({picks.length})
        </div>
        <ul className="space-y-1 text-sm text-slate-700">
          {picks.map((a) => <li key={a}>• {a}</li>)}
        </ul>
        {note && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Note</div>
            <div className="text-sm text-slate-700 italic">{note}</div>
          </div>
        )}
      </div>

      {timesSubmitted ? (
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Picked times</div>
          <ul className="space-y-1 text-sm text-slate-700">
            {(lead.raw?.picked_times || []).map((p, i) => (
              <li key={i}>• {p.address} — {p.slotDate} at {p.slotTime}</li>
            ))}
          </ul>
          <div className="text-[11px] text-slate-500 mt-2">
            Times confirmed {lead.raw?.times_submitted_at ? new Date(lead.raw.times_submitted_at).toLocaleString() : ''} — book each tour in your CRM Tours tab.
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-600">
            {schedulingSent
              ? `Sent ${new Date(lead.raw.scheduling_open_at).toLocaleString()} — waiting on lead to pick times.`
              : 'Confirm properties are still available, then send the scheduling link.'}
          </div>
          <Button onClick={onSend} disabled={busy}>
            {busy ? 'Sending…' : schedulingSent ? 'Re-send link' : 'Send scheduling link'}
          </Button>
        </div>
      )}
    </Card>
  );
}

function CuratedLinkPanel({ lead, updateLead, showToast }) {
  const [url, setUrl] = useState(lead.raw?.curated_portal_url || '');
  const [busy, setBusy] = useState(false);
  const alreadySent = !!lead.curatedLinkSentAt;
  const firstName = (lead.fullName || '').split(' ')[0];

  const onSend = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl || !/^https?:\/\//.test(cleanUrl)) {
      showToast('Paste a valid BrightMLS portal URL first');
      return;
    }
    setBusy(true);

    const token = lead.raw?.curated_token || (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18));
    const appBase =
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      'https://rentalsphilly.vercel.app';
    const curatedUrl = `${appBase}/c/${token}`;

    const smsBody = `Rentals Philly: Your hand-picked rentals are ready. View photos & request tours: ${curatedUrl}`;
    const emailSubject = 'Your hand-picked Philly rentals';
    const emailBody =
      `Hi ${firstName},\n\n` +
      `I hand-picked rentals for you. Click below to browse photos on BrightMLS, then tell me which you'd like to tour and what times work:\n\n` +
      `${curatedUrl}\n\n` +
      `— Morgan`;

    try {
      const smsResult = await sendSMS({
        leadId: lead.id,
        body: smsBody,
        kind: 'manual',
        idempotencyKey: `curated-link-${lead.id}-${Date.now()}`,
        automated: false,
      });
      if (!smsResult.ok && smsResult.error !== 'opted_out') {
        showToast(`SMS not sent — ${smsResult.error || 'send failed'}`);
        setBusy(false);
        return;
      }
      await sendEmail({
        leadId: lead.id,
        subject: emailSubject,
        body: emailBody,
        kind: 'manual',
        idempotencyKey: `curated-link-email-${lead.id}-${Date.now()}`,
        automated: false,
      });

      const updatedTasks = (lead.tasks || []).map((t) =>
        Array.isArray(t.flags) && t.flags.includes('curate-portal') && t.status === 'pending'
          ? { ...t, status: 'done', completedAt: new Date().toISOString() }
          : t
      );
      await updateLead(lead.id, {
        raw: {
          ...(lead.raw || {}),
          curated_token: token,
          curated_portal_url: cleanUrl,
          curated_link_url: curatedUrl,
          curated_link_sent_at: new Date().toISOString(),
        },
        curatedLinkUrl: curatedUrl,
        curatedLinkSentAt: new Date().toISOString(),
        stage: lead.stage === 'new' ? 'matched' : lead.stage,
        tasks: updatedTasks,
        activities: [...(lead.activities || []), {
          id: `a_${Date.now()}`,
          type: 'curated-link-sent',
          timestamp: new Date().toISOString(),
          message: `Curated link sent to ${firstName}`,
        }],
      });
      showToast('Curated link sent — lead got SMS + email');
    } catch (err) {
      console.error('[curated link] send failed', err);
      showToast('Send failed — check logs');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 space-y-4 bg-amber-50 border-amber-200">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {alreadySent ? 'Update curated link' : 'Send curated link'}
          </div>
          <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            Just paste the BrightMLS portal URL. Lead gets a branded page that opens
            the portal for photos and lets them pick addresses + times to tour.
          </div>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
          BrightMLS portal URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://matrix.brightmls.com/Matrix/Public/Portal.aspx?ID=..."
          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 font-mono"
        />
        <div className="text-[11px] text-slate-500 mt-1.5">
          BrightMLS Matrix → run your search → <strong>Share → Send to client</strong> → copy URL → paste here.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-slate-500">
          Sends to: <span className="font-mono">{lead.phone}</span> · <span className="font-mono">{lead.email}</span>
        </div>
        <Button onClick={onSend} disabled={busy || !url.trim()}>
          {busy ? 'Sending…' : (alreadySent ? 'Re-send' : 'Send link')}
        </Button>
      </div>

      {alreadySent && (
        <div className="text-[11px] text-slate-500 pt-2 border-t border-amber-200">
          Last sent {new Date(lead.curatedLinkSentAt).toLocaleString()} ·{' '}
          <a href={lead.curatedLinkUrl} target="_blank" rel="noopener noreferrer" className="underline text-slate-700">
            open the lead&apos;s page <ExternalLink className="w-3 h-3 inline" />
          </a>
        </div>
      )}
    </Card>
  );
}

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
            <StageDropdown lead={lead} updateLead={updateLead} showToast={showToast} />
            <Pill tone="neutral">{lead.bucket}</Pill>
            {lead.opted_out && <Pill tone="danger" icon={Shield}>Opted out of SMS</Pill>}
            {lead.screening?.status === 'completed' && <Pill tone="accent" icon={Shield}>Screened</Pill>}
            {lead.application && <Pill tone="positive" icon={FileCheck}>App on file</Pill>}
            {submissionCount > 0 && <Pill tone="info">{submissionCount} {submissionCount === 1 ? 'submission' : 'submissions'}</Pill>}
            <span className="text-xs text-slate-500">Move {fmtDate(lead.moveInDate)}</span>
            <Button
              size="sm"
              icon={MessageSquare}
              onClick={() => onCompose('sms-custom')}
              disabled={!!lead.opted_out}
              title={lead.opted_out ? 'Lead has opted out of SMS' : undefined}
              className="ml-auto"
            >
              Text
            </Button>
          </div>
        </div>

        {/* Tabs — collapsed: only show Pipeline if there's screening/app/submission activity */}
        <div className="flex gap-1 px-5 border-b border-slate-200 shrink-0 overflow-x-auto">
          {[
            { k: 'overview', label: 'Overview' },
            { k: 'messages', label: 'Messages', count: (lead.messages || []).length },
            { k: 'pipeline', label: 'Pipeline', count: submissionCount, dot: !!lead.application || !!lead.screening, alert: lead.application && !lead.application.reviewed,
              show: !!lead.application || !!lead.screening || submissionCount > 0 },
            { k: 'activity', label: 'Activity' },
          ].filter(t => t.show !== false).map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${tab === t.k ? 'text-brand-ink border-brand-ink' : 'text-slate-500 border-transparent hover:text-slate-900'}`}>
              {t.label}
              {t.count > 0 && <span className="text-xs text-slate-400">{t.count}</span>}
              {t.alert && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
              {t.dot && !t.alert && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--brand-gold)' }} />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && (
            <div className="space-y-5">
              {/* Phase 1: send curated BrightMLS portal link. */}
              <CuratedLinkPanel lead={lead} updateLead={updateLead} showToast={showToast} />
              {/* Phase 2: after lead picks properties, agent reviews + sends scheduling link. */}
              <SchedulingLinkPanel lead={lead} updateLead={updateLead} showToast={showToast} />
              {/* Commission tracking (only after stage >= applied). */}
              <CommissionPanel lead={lead} updateLead={updateLead} showToast={showToast} />

              <div>
                <SectionHeader>Lead details</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Budget" value={`${fmtCurrency(Number(lead.budgetMin))} – ${fmtCurrency(Number(lead.budgetMax))}`} />
                  <InfoItem
                    label="Beds / Baths"
                    value={`${lead.beds === '0' ? 'Studio' : `${lead.beds}+ bd`} · ${lead.baths}+ ba`}
                  />
                  <InfoItem label="Areas" value={lead.areas || 'No preference'} />
                  <InfoItem label="Move-in" value={fmtDate(lead.moveInDate)} />
                  <InfoItem
                    label="Tour windows"
                    value={(lead.tourAvailability || []).length > 0
                      ? (lead.tourAvailability || []).map(id => TOUR_WINDOWS.find(w => w.id === id)?.label).filter(Boolean).join(', ')
                      : 'Not specified'}
                  />
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

          {/* Pipeline = consolidated screening + application + submissions, single tab */}
          {tab === 'pipeline' && (
            <div className="space-y-6">
              <ScreeningTab lead={lead} onOpenScreening={onOpenScreening} settings={settings} />
              <div className="border-t border-slate-200 pt-6">
                <SubmissionsTab lead={lead} onOpenSubmit={onOpenSubmit} onOpenFollowUp={onOpenFollowUp} updateSubmissionStatus={updateSubmissionStatus} />
              </div>
            </div>
          )}

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
        <Button
          size="sm"
          icon={MessageSquare}
          onClick={() => onCompose('sms-custom')}
          disabled={!!lead.opted_out}
          title={lead.opted_out ? 'Lead has opted out of SMS' : undefined}
        >
          Text client
        </Button>
        <Button size="sm" variant="secondary" icon={Mail} onClick={() => onCompose('email-custom')}>Email client</Button>
      </div>

      {lead.opted_out && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
          <Shield className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            This lead replied <strong>STOP</strong> and is opted out of SMS.
            They can still receive email. Inbound replies will reactivate them
            if they text <strong>START</strong>.
          </div>
        </div>
      )}

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
// PIPELINE — kanban view of all leads grouped by stage.
// Click a card to open lead. Quick "→" advances stage with auto-tasks.
// ============================================================
function PipelineView({ leads, updateLead, onSelectLead, showToast }) {
  const [showWon, setShowWon] = useState(false);
  const [search, setSearch] = useState('');

  // Group leads by stage.
  const byStage = useMemo(() => {
    const m = {};
    for (const s of PIPELINE_STAGES) m[s.id] = [];
    for (const lead of leads) {
      const stage = lead.stage || 'new';
      if (!m[stage]) m[stage] = [];
      m[stage].push(lead);
    }
    // Sort each column: most recently created or updated first.
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
      );
    }
    return m;
  }, [leads]);

  // Default columns hide paid/lost unless toggled (keeps the active funnel clean).
  const visibleStages = useMemo(() =>
    PIPELINE_STAGES.filter((s) => showWon || !['paid', 'lost'].includes(s.id)),
    [showWon]
  );

  const advanceStage = async (lead, e) => {
    e?.stopPropagation();
    const idx = PIPELINE_STAGES.findIndex((s) => s.id === (lead.stage || 'new'));
    if (idx < 0 || idx >= PIPELINE_STAGES.length - 2) return; // skip if at leased/paid/lost
    const next = PIPELINE_STAGES[idx + 1];
    const firstName = (lead.fullName || '').split(' ')[0] || 'there';
    const newTasks = stageDefaultTasks(next.id, lead, firstName);
    await updateLead(lead.id, {
      stage: next.id,
      tasks: [...(lead.tasks || []), ...newTasks],
      activities: [...(lead.activities || []), {
        id: `a_${Date.now()}`, type: 'stage-advanced',
        timestamp: new Date().toISOString(),
        message: `Stage → ${next.label}`,
      }],
    });
    showToast(`${firstName} → ${next.label}${newTasks.length ? ` · +${newTasks.length} task${newTasks.length === 1 ? '' : 's'}` : ''}`);
  };

  // Search filter applied to lead names + emails + phones.
  const matchesSearch = (lead) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (lead.fullName || '').toLowerCase().includes(q) ||
      (lead.email || '').toLowerCase().includes(q) ||
      (lead.phone || '').toLowerCase().includes(q)
    );
  };

  const totalCommission = useMemo(() => {
    return leads
      .filter((l) => l.commission?.amount && (l.stage === 'leased' || l.stage === 'paid'))
      .reduce((sum, l) => sum + Number(l.commission.amount || 0), 0);
  }, [leads]);

  const toneClass = (tone) => ({
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    accent: 'bg-violet-50 text-violet-700 border-violet-200',
    positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
  }[tone] || 'bg-slate-100 text-slate-700 border-slate-200');

  const lastActivityLabel = (lead) => {
    const msgs = (lead.messages || []).filter((m) => !m.internal);
    const last = msgs[msgs.length - 1];
    if (last) return `${last.direction === 'inbound' ? 'They' : 'You'}: ${(last.body || '').slice(0, 36)}`;
    if (lead.createdAt) return `Created ${timeAgo(lead.createdAt)}`;
    return '';
  };

  const needsAttention = (lead) => {
    // Last message is inbound = needs reply
    const msgs = (lead.messages || []).filter((m) => !m.internal);
    return msgs.length > 0 && msgs[msgs.length - 1].direction === 'inbound';
  };

  return (
    <div className="space-y-4">
      {/* Top summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-full focus:outline-none focus:border-slate-400 bg-white"
          />
        </div>
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showWon} onChange={(e) => setShowWon(e.target.checked)} className="rounded" />
          Show Won / Lost
        </label>
        {totalCommission > 0 && (
          <div className="text-xs text-emerald-700 font-medium ml-auto">
            <Award className="w-3.5 h-3.5 inline mr-1" />
            {fmtCurrency(totalCommission)} earned this period
          </div>
        )}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {visibleStages.map((stage) => {
          const all = byStage[stage.id] || [];
          const filtered = all.filter(matchesSearch);
          return (
            <div key={stage.id} className="flex-shrink-0 w-72 flex flex-col">
              <div className={`px-3 py-2 rounded-t-xl border-t border-x ${toneClass(stage.tone)}`}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs uppercase tracking-wider">{stage.label}</div>
                  <div className="text-[10px] font-bold tabular-nums">{filtered.length}{filtered.length !== all.length && ` / ${all.length}`}</div>
                </div>
              </div>
              <div className="flex-1 bg-slate-50 border-x border-b border-slate-200 rounded-b-xl p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-260px)] overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="text-[11px] italic text-slate-400 text-center py-4">Empty</div>
                ) : filtered.map((lead) => {
                  const attention = needsAttention(lead);
                  const canAdvance = !['leased', 'paid', 'lost'].includes(lead.stage || 'new');
                  return (
                    <button
                      key={lead.id}
                      onClick={() => onSelectLead(lead.id)}
                      className={`w-full text-left bg-white rounded-lg p-2.5 border transition-all hover:shadow-sm hover:border-slate-300 ${
                        attention ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {attention && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                        <div className="font-semibold text-sm text-slate-900 truncate flex-1">{lead.fullName}</div>
                        {canAdvance && (
                          <button
                            onClick={(e) => advanceStage(lead, e)}
                            title={`Advance to ${PIPELINE_STAGES[PIPELINE_STAGES.findIndex((s) => s.id === (lead.stage || 'new')) + 1]?.label}`}
                            className="text-slate-300 hover:text-emerald-600 shrink-0 p-0.5"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mb-1 truncate">
                        {lead.budgetMin && lead.budgetMax
                          ? `${fmtCurrency(Number(lead.budgetMin))}–${fmtCurrency(Number(lead.budgetMax))}`
                          : 'No budget'}
                        {' · '}
                        {lead.beds === '0' ? 'Studio' : `${lead.beds || '?'}+ bd`}
                      </div>
                      {lead.moveInDate && (
                        <div className="text-[10px] text-slate-400 mb-1">Move {fmtDate(lead.moveInDate)}</div>
                      )}
                      <div className="text-[11px] text-slate-600 line-clamp-1">{lastActivityLabel(lead)}</div>
                      {lead.commission?.amount && (
                        <div className="mt-1.5 text-[10px] font-semibold text-emerald-700">
                          {fmtCurrency(Number(lead.commission.amount))}
                          {lead.commission.received_at && ' ✓ paid'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// UNIFIED INBOX — split-pane: thread list + conversation + lead context
// ============================================================
function fillTemplate(tpl, lead, settings) {
  const firstName = (lead?.fullName || '').split(' ')[0] || 'there';
  const portalUrl = lead?.raw?.curated_link_url || `https://rentalsphilly.vercel.app/c/${lead?.raw?.curated_token || ''}`;
  const nextTour = (lead?.tours || []).find((t) => t.status !== 'cancelled' && t.status !== 'completed');
  const tourDate = nextTour?.date ? new Date(nextTour.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const tourTime = nextTour?.time || '';
  return tpl
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{portalUrl\}/g, portalUrl)
    .replace(/\{tourDate\}/g, tourDate)
    .replace(/\{tourTime\}/g, tourTime)
    .replace(/\{agentName\}/g, settings?.agentName || 'Morgan');
}

function InboxView({ leads, onSelectLead, updateLead, settings, showToast }) {
  const [filter, setFilter] = useState('needs-reply');
  const [search, setSearch] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [composerChannel, setComposerChannel] = useState('sms');
  const [composerBody, setComposerBody] = useState('');
  const [composerSubject, setComposerSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  // AI suggestion cache — keyed by lead.id + last inbound message id so we don't
  // re-burn the API on every render. Values: { suggestion, loading, error }.
  const [aiSuggestions, setAiSuggestions] = useState({});
  const [aiDismissed, setAiDismissed] = useState({});
  const scrollerRef = useRef(null);

  // User templates (live-edited in Settings).
  const userTemplates = settings?.quickReplyTemplates || DEFAULT_AGENT_SETTINGS.quickReplyTemplates;

  // Build a thread per lead = lead + sorted messages + lastMessage + unread flag.
  const threads = useMemo(() => {
    return leads
      .map((lead) => {
        const msgs = (lead.messages || []).filter((m) => !m.internal)
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const last = msgs[msgs.length - 1];
        const lastReadAt = lead.raw?.inbox_last_read_at;
        const isUnread = last && last.direction === 'inbound' &&
          (!lastReadAt || new Date(last.timestamp) > new Date(lastReadAt));
        return {
          lead,
          messages: msgs,
          last,
          isUnread,
          needsReply: last?.direction === 'inbound',
        };
      })
      .filter((t) => t.last) // only threads with messages
      .sort((a, b) => new Date(b.last.timestamp) - new Date(a.last.timestamp));
  }, [leads]);

  // Counts for filter tabs.
  const counts = useMemo(() => ({
    unread: threads.filter((t) => t.isUnread).length,
    needsReply: threads.filter((t) => t.needsReply).length,
    all: threads.length,
    sms: threads.filter((t) => t.last.channel === 'sms').length,
    email: threads.filter((t) => t.last.channel === 'email').length,
  }), [threads]);

  // Apply filter + search.
  const visibleThreads = useMemo(() => {
    let out = threads;
    if (filter === 'unread') out = out.filter((t) => t.isUnread);
    else if (filter === 'needs-reply') out = out.filter((t) => t.needsReply);
    else if (filter === 'sms') out = out.filter((t) => t.last.channel === 'sms');
    else if (filter === 'email') out = out.filter((t) => t.last.channel === 'email');
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((t) =>
        (t.lead.fullName || '').toLowerCase().includes(q) ||
        (t.lead.email || '').toLowerCase().includes(q) ||
        (t.lead.phone || '').toLowerCase().includes(q) ||
        t.messages.some((m) => (m.body || '').toLowerCase().includes(q))
      );
    }
    return out;
  }, [threads, filter, search]);

  // Default selection = first visible thread (or whatever was selected before).
  const activeThread = useMemo(() => {
    if (selectedThreadId) {
      const t = threads.find((x) => x.lead.id === selectedThreadId);
      if (t) return t;
    }
    return visibleThreads[0] || null;
  }, [threads, visibleThreads, selectedThreadId]);

  // Mark active thread as read on selection.
  useEffect(() => {
    if (!activeThread || !activeThread.isUnread) return;
    const id = activeThread.lead.id;
    updateLead(id, {
      raw: { ...(activeThread.lead.raw || {}), inbox_last_read_at: new Date().toISOString() },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread?.lead.id]);

  // Auto-scroll to bottom of thread on switch / new message.
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [activeThread?.lead.id, activeThread?.messages.length]);

  // Reset composer when switching threads.
  useEffect(() => {
    setComposerBody('');
    setComposerSubject('');
    setComposerChannel('sms');
  }, [activeThread?.lead.id]);

  // Cache key for the current thread = leadId + last inbound message id.
  // Re-fetching only when the lead OR the last inbound message changes prevents
  // re-burning the API on every render.
  const aiCacheKey = useMemo(() => {
    if (!activeThread) return null;
    const last = activeThread.last;
    if (!last || last.direction !== 'inbound') return null;
    return `${activeThread.lead.id}::${last.id}`;
  }, [activeThread]);

  const aiSlot = aiCacheKey ? aiSuggestions[aiCacheKey] : null;
  const isDismissed = aiCacheKey ? !!aiDismissed[aiCacheKey] : false;

  // Auto-fetch the AI suggestion when a thread that needs a reply is opened.
  const fetchSuggestion = async (force = false) => {
    if (!aiCacheKey || !activeThread) return;
    if (!force && aiSuggestions[aiCacheKey]?.suggestion) return;
    setAiSuggestions((prev) => ({ ...prev, [aiCacheKey]: { loading: true } }));
    try {
      const res = await fetch('/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: activeThread.lead.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAiSuggestions((prev) => ({ ...prev, [aiCacheKey]: { error: data.error || 'failed' } }));
      } else {
        setAiSuggestions((prev) => ({ ...prev, [aiCacheKey]: { suggestion: data.suggestion } }));
      }
    } catch (err) {
      setAiSuggestions((prev) => ({ ...prev, [aiCacheKey]: { error: err.message } }));
    }
  };

  useEffect(() => {
    if (!aiCacheKey || isDismissed) return;
    if (aiSuggestions[aiCacheKey]) return; // cached
    fetchSuggestion(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiCacheKey, isDismissed]);

  const insertTemplate = (tpl) => {
    if (!activeThread) return;
    setComposerBody(fillTemplate(tpl.body, activeThread.lead, settings));
  };

  const handleSend = async () => {
    if (!activeThread) return;
    const lead = activeThread.lead;
    if (!composerBody.trim()) return;
    if (composerChannel === 'sms' && lead.opted_out) {
      showToast('Lead has opted out of SMS');
      return;
    }
    setSending(true);
    try {
      let newMsg;
      if (composerChannel === 'sms') {
        const result = await sendSMS({
          leadId: lead.id,
          body: composerBody,
          kind: 'manual',
          idempotencyKey: `inbox-${lead.id}-${Date.now()}`,
          automated: false,
        });
        if (!result.ok) {
          const reason = result.error === 'opted_out' ? 'lead has opted out' :
                         result.error === 'invalid_phone' ? 'invalid phone' : result.error || 'send failed';
          showToast(`SMS not sent — ${reason}`);
          setSending(false);
          return;
        }
        newMsg = {
          id: result.message.id, channel: 'sms', direction: 'outbound',
          status: result.message.status || 'sent', to: result.message.to, via: 'twilio',
          subject: null, body: result.message.body,
          timestamp: result.message.created_at || new Date().toISOString(),
          automated: false,
        };
      } else {
        const result = await sendEmail({
          leadId: lead.id, subject: composerSubject || '(no subject)', body: composerBody,
          kind: 'manual', idempotencyKey: `inbox-email-${lead.id}-${Date.now()}`, automated: false,
        });
        if (!result.ok) {
          showToast(`Email not sent — ${result.error || 'send failed'}`);
          setSending(false);
          return;
        }
        newMsg = result.message ? {
          id: result.message.id, channel: 'email', direction: 'outbound',
          status: result.message.status || 'sent', to: result.message.to, via: 'resend',
          subject: result.message.subject, body: result.message.body,
          timestamp: result.message.created_at || new Date().toISOString(), automated: false,
        } : {
          id: `m_${Date.now()}`, channel: 'email', direction: 'outbound', status: 'sent',
          to: lead.email, via: 'resend',
          subject: composerSubject, body: composerBody, timestamp: new Date().toISOString(),
        };
      }
      await updateLead(lead.id, {
        messages: [...(lead.messages || []), newMsg],
        activities: [...(lead.activities || []), {
          id: `a_${Date.now()}`, type: 'message-sent',
          timestamp: new Date().toISOString(),
          message: `${composerChannel === 'sms' ? 'SMS' : 'Email'} sent (from inbox)`,
        }],
        raw: { ...(lead.raw || {}), inbox_last_read_at: new Date().toISOString() },
      });
      setComposerBody('');
      setComposerSubject('');
      showToast(`${composerChannel === 'sms' ? 'SMS' : 'Email'} sent`);
    } catch (err) {
      console.error('[inbox send]', err);
      showToast(`Send failed — ${err.message}`);
    }
    setSending(false);
  };

  // Today action cards.
  const newLeadsNoCurate = useMemo(() =>
    leads.filter((l) => l.stage === 'new' && !l.curatedLinkSentAt), [leads]);
  const requestedTours = useMemo(() =>
    leads.filter((l) => l.stage === 'tour-requested' || (l.tours || []).some((t) => t.status === 'requested')), [leads]);
  const toursToday = useMemo(() => {
    const today = new Date().toDateString();
    return leads.flatMap((l) => (l.tours || []).filter((t) => {
      if (t.status === 'cancelled' || t.status === 'completed') return false;
      const d = t.date ? new Date(t.date + 'T00:00:00').toDateString() : null;
      return d === today;
    }).map((t) => ({ ...t, lead: l })));
  }, [leads]);

  const segments = composerChannel === 'sms' ? Math.max(1, Math.ceil(composerBody.length / 160)) : 0;

  return (
    <div className="space-y-4">
      {/* TODAY action cards stay above the inbox (same as before, condensed). */}
      {(newLeadsNoCurate.length > 0 || requestedTours.length > 0 || toursToday.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {newLeadsNoCurate.length > 0 && (
            <button onClick={() => onSelectLead(newLeadsNoCurate[0].id)}
              className="px-3 py-2 rounded-xl border-2 text-xs font-medium inline-flex items-center gap-2"
              style={{ backgroundColor: 'var(--brand-gold-soft)', borderColor: 'var(--brand-gold)' }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand-gold)' }} />
              {newLeadsNoCurate.length} new lead{newLeadsNoCurate.length === 1 ? '' : 's'} need curated link
            </button>
          )}
          {requestedTours.length > 0 && (
            <button onClick={() => onSelectLead(requestedTours[0].id)}
              className="px-3 py-2 rounded-xl border-2 border-blue-200 bg-blue-50 text-xs font-medium text-blue-900 inline-flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              {requestedTours.length} tour request{requestedTours.length === 1 ? '' : 's'} pending
            </button>
          )}
          {toursToday.length > 0 && (
            <div className="px-3 py-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-900 inline-flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5" />
              {toursToday.length} tour{toursToday.length === 1 ? '' : 's'} today
            </div>
          )}
        </div>
      )}

      {threads.length === 0 ? (
        <EmptyState icon={Inbox} title="No conversations yet" desc="Messages will appear here as they come in." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_280px] gap-3 h-[calc(100vh-300px)] min-h-[500px]">
          {/* LEFT: thread list */}
          <Card className="p-0 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search threads…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {[
                  { k: 'unread', label: 'Unread', count: counts.unread },
                  { k: 'needs-reply', label: 'Needs reply', count: counts.needsReply },
                  { k: 'all', label: 'All', count: counts.all },
                  { k: 'sms', label: 'SMS', count: counts.sms },
                  { k: 'email', label: 'Email', count: counts.email },
                ].map((f) => (
                  <button key={f.k} onClick={() => setFilter(f.k)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                      filter === f.k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {f.label}{f.count > 0 && <span className={filter === f.k ? 'text-white/60' : 'text-slate-400'}>{f.count}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {visibleThreads.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 italic">No matching threads</div>
              ) : visibleThreads.map((t) => {
                const isActive = activeThread?.lead.id === t.lead.id;
                const preview = (t.last.body || '').replace(/\n+/g, ' ').slice(0, 60);
                return (
                  <button key={t.lead.id}
                    onClick={() => setSelectedThreadId(t.lead.id)}
                    className={`w-full text-left p-3 transition-colors block ${
                      isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      {t.isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                      <div className={`font-medium text-sm truncate ${t.isUnread ? 'text-slate-900' : 'text-slate-700'}`}>
                        {t.lead.fullName}
                      </div>
                      <div className="text-[10px] text-slate-400 ml-auto shrink-0">{timeAgo(t.last.timestamp)}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                      {t.last.channel === 'sms' ? <MessageSquare className="w-3 h-3 shrink-0" /> : <Mail className="w-3 h-3 shrink-0" />}
                      {t.last.direction === 'outbound' && <span className="text-slate-400">You: </span>}
                      <span className="truncate">{preview}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* CENTER: active conversation */}
          {activeThread ? (
            <Card className="p-0 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                <button onClick={() => onSelectLead(activeThread.lead.id)} className="font-semibold text-sm text-slate-900 hover:underline">
                  {activeThread.lead.fullName}
                </button>
                <Pill tone="info">{activeThread.lead.stage}</Pill>
                {activeThread.lead.opted_out && <Pill tone="danger">Opted out</Pill>}
                <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                  {activeThread.lead.phone && <span className="hidden md:inline">{activeThread.lead.phone}</span>}
                  <button onClick={() => onSelectLead(activeThread.lead.id)} className="text-xs text-slate-500 hover:text-slate-900 underline">
                    Open lead
                  </button>
                </div>
              </div>
              <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
                {activeThread.messages.map((m) => {
                  const out = m.direction === 'outbound';
                  return (
                    <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                        out ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 border border-slate-200'
                      }`}>
                        {m.subject && <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${out ? 'text-white/60' : 'text-slate-400'}`}>{m.subject}</div>}
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div className={`text-[10px] mt-1 flex items-center gap-1.5 ${out ? 'text-white/60' : 'text-slate-400'}`}>
                          {m.channel === 'sms' ? <MessageSquare className="w-2.5 h-2.5" /> : <Mail className="w-2.5 h-2.5" />}
                          {timeAgo(m.timestamp)}
                          {m.automated && <span>· auto</span>}
                          {m.status && out && <span>· {m.status}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* AI SUGGESTED REPLY — appears above composer when the last
                  message is inbound. */}
              {aiCacheKey && !isDismissed && (
                <div
                  className="border-t border-slate-200 px-3 py-2.5"
                  style={{ background: 'linear-gradient(180deg, rgba(181,142,84,0.06), transparent)' }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand-gold)' }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--brand-gold)' }}>
                      AI suggested reply
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => fetchSuggestion(true)}
                        disabled={aiSlot?.loading}
                        className="text-[10px] text-slate-500 hover:text-slate-900 px-2 py-0.5 rounded"
                        title="Regenerate"
                      >
                        ↻ Regenerate
                      </button>
                      <button
                        onClick={() => setAiDismissed((p) => ({ ...p, [aiCacheKey]: true }))}
                        className="text-slate-400 hover:text-slate-700"
                        title="Hide"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {aiSlot?.loading ? (
                    <div className="text-xs text-slate-500 italic flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse" style={{ backgroundColor: 'var(--brand-gold)' }} />
                      Drafting a reply…
                    </div>
                  ) : aiSlot?.error ? (
                    <div className="text-xs text-red-600">
                      Couldn&apos;t draft a reply: {aiSlot.error}.{' '}
                      <button onClick={() => fetchSuggestion(true)} className="underline">Retry</button>
                    </div>
                  ) : aiSlot?.suggestion ? (
                    <div className="space-y-2">
                      <div className="text-sm text-slate-800 whitespace-pre-wrap bg-white rounded-lg p-2.5 border border-slate-200">
                        {aiSlot.suggestion}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setComposerBody(aiSlot.suggestion)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold text-white inline-flex items-center gap-1.5"
                          style={{ backgroundColor: 'var(--brand-gold)' }}
                        >
                          <Check className="w-3 h-3" /> Use this draft
                        </button>
                        <button
                          onClick={() => { setComposerBody(aiSlot.suggestion); }}
                          className="text-[10px] text-slate-500 hover:text-slate-900"
                          title="Paste and edit before sending"
                        >
                          Use &amp; edit
                        </button>
                        <span className="text-[10px] text-slate-400 ml-auto">Claude Haiku · review before sending</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => fetchSuggestion(true)}
                      className="text-xs text-slate-500 underline hover:text-slate-900"
                    >
                      Draft an AI reply
                    </button>
                  )}
                </div>
              )}

              {/* COMPOSER */}
              <div className="border-t border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex rounded-full bg-slate-100 p-0.5">
                    <button onClick={() => setComposerChannel('sms')}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${composerChannel === 'sms' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>
                      <MessageSquare className="w-3 h-3 inline mr-1" /> SMS
                    </button>
                    <button onClick={() => setComposerChannel('email')}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${composerChannel === 'email' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>
                      <Mail className="w-3 h-3 inline mr-1" /> Email
                    </button>
                  </div>
                  <div className="flex-1 flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setShowTemplatePicker(true)}
                      className="px-3 py-1 rounded-full text-xs font-medium border-2 inline-flex items-center gap-1.5 transition-colors hover:bg-slate-50"
                      style={{ borderColor: 'var(--brand-gold)', color: 'var(--brand-gold)' }}
                    >
                      <FileText className="w-3.5 h-3.5" /> Use template
                    </button>
                  </div>
                </div>
                {composerChannel === 'email' && (
                  <input value={composerSubject} onChange={(e) => setComposerSubject(e.target.value)}
                    placeholder="Subject"
                    className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400" />
                )}
                <textarea value={composerBody} onChange={(e) => setComposerBody(e.target.value)}
                  placeholder={composerChannel === 'sms' ? 'Type a text…' : 'Type an email…'}
                  rows={composerChannel === 'sms' ? 3 : 5}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 resize-none" />
                <div className="flex items-center gap-3">
                  {composerChannel === 'sms' && (
                    <div className="text-[10px] text-slate-400">
                      {composerBody.length} chars · {segments} segment{segments !== 1 ? 's' : ''}
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 hidden md:inline">⌘+Enter to send</span>
                    <button onClick={handleSend}
                      disabled={!composerBody.trim() || sending || (composerChannel === 'sms' && activeThread.lead.opted_out)}
                      className="px-4 py-1.5 bg-slate-900 text-white rounded-full text-xs font-medium hover:bg-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-40">
                      <Send className="w-3 h-3" /> {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
                {composerChannel === 'sms' && activeThread.lead.opted_out && (
                  <div className="text-[10px] text-red-600">Lead has opted out — SMS disabled.</div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-8 flex items-center justify-center text-slate-400 text-sm">
              Select a conversation
            </Card>
          )}

          {/* RIGHT: lead context (lg+ only) */}
          {activeThread && (
            <Card className="p-4 overflow-y-auto hidden lg:block">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">Lead at a glance</div>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Stage</div>
                  <div className="font-medium text-slate-900">{activeThread.lead.stage || 'new'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Budget</div>
                  <div className="font-medium text-slate-900">
                    {activeThread.lead.budgetMin ? fmtCurrency(Number(activeThread.lead.budgetMin)) : '?'}
                    {' – '}
                    {activeThread.lead.budgetMax ? fmtCurrency(Number(activeThread.lead.budgetMax)) : '?'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Beds / Baths</div>
                  <div className="font-medium text-slate-900">
                    {activeThread.lead.beds === '0' ? 'Studio' : `${activeThread.lead.beds}+ bd`} · {activeThread.lead.baths}+ ba
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Areas</div>
                  <div className="font-medium text-slate-900 text-xs">{activeThread.lead.areas || 'No preference'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Move-in</div>
                  <div className="font-medium text-slate-900">{fmtDate(activeThread.lead.moveInDate)}</div>
                </div>
                {activeThread.lead.raw?.curated_address_picks?.length > 0 && (
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide">Picked properties</div>
                    <ul className="text-xs space-y-0.5 mt-1">
                      {activeThread.lead.raw.curated_address_picks.slice(0, 5).map((a, i) => (
                        <li key={i} className="text-slate-700">• {a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(activeThread.lead.tours || []).filter((t) => t.status !== 'cancelled').length > 0 && (
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide">Tours</div>
                    {(activeThread.lead.tours || []).slice(0, 3).map((t) => (
                      <div key={t.id} className="text-xs text-slate-700">
                        {t.date} {t.time} · {t.status}
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => onSelectLead(activeThread.lead.id)}
                  className="w-full px-3 py-2 rounded-full text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors mt-3">
                  Open full lead detail →
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {showTemplatePicker && activeThread && (
        <TemplatePickerModal
          templates={userTemplates}
          lead={activeThread.lead}
          settings={settings}
          channel={composerChannel}
          onPick={(filled) => {
            setComposerBody(filled);
            setShowTemplatePicker(false);
          }}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  );
}

function TemplatePickerModal({ templates, lead, settings, channel, onPick, onClose }) {
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState(templates[0]?.id || null);

  const visible = useMemo(() => {
    const list = templates.filter((t) => !t.channel || t.channel === channel || t.channel === 'both');
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((t) =>
      (t.label || '').toLowerCase().includes(q) ||
      (t.body || '').toLowerCase().includes(q)
    );
  }, [templates, search, channel]);

  const previewed = visible.find((t) => t.id === hoveredId) || visible[0];
  const previewText = previewed ? fillTemplate(previewed.body, lead, settings) : '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">Choose a template</div>
            <div className="text-xs text-slate-500">Filtered for {channel === 'sms' ? 'SMS' : 'email'} · placeholders auto-fill for {lead.fullName}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-full focus:outline-none focus:border-slate-400"
            />
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">
          {/* LIST */}
          <div className="border-r border-slate-100 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 italic">
                No templates match.{' '}
                Add some in <span className="text-slate-600">Settings → Templates</span>.
              </div>
            ) : visible.map((tpl) => (
              <button
                key={tpl.id}
                onMouseEnter={() => setHoveredId(tpl.id)}
                onClick={() => onPick(fillTemplate(tpl.body, lead, settings))}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors ${
                  previewed?.id === tpl.id ? 'bg-slate-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-sm text-slate-900">{tpl.label}</div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">{(tpl.body || '').replace(/\n+/g, ' ').slice(0, 60)}</div>
              </button>
            ))}
          </div>
          {/* PREVIEW */}
          <div className="p-4 overflow-y-auto bg-slate-50">
            {previewed ? (
              <>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Preview (placeholders filled in)</div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 text-sm whitespace-pre-wrap text-slate-800 leading-relaxed font-mono">
                  {previewText}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => onPick(previewText)}
                    className="px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 inline-flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> Use this template
                  </button>
                  <span className="text-[10px] text-slate-400">{previewText.length} chars</span>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-400 italic text-center py-12">Pick a template to preview</div>
            )}
          </div>
        </div>
        <div className="px-5 py-2.5 border-t border-slate-100 text-[11px] text-slate-500 text-center">
          Manage your templates in <span className="font-medium text-slate-700">Settings → Templates → Quick replies</span>
        </div>
      </div>
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
// ============================================================
// TODAY STRIP — at-a-glance KPI bar that lives above every admin tab
// ============================================================
function TodayStrip({ metrics, upcomingTours, overdueTasks, todayTasks }) {
  const today = upcomingTours.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const stats = [
    { label: 'Tours today', value: today, icon: CalendarDays, tone: today > 0 ? 'accent' : 'neutral' },
    { label: 'Upcoming', value: upcomingTours.length, icon: Clock },
    { label: 'Overdue tasks', value: overdueTasks.length, icon: AlertTriangle, tone: overdueTasks.length > 0 ? 'danger' : 'neutral' },
    { label: 'Today\'s tasks', value: todayTasks.length, icon: Flag },
    { label: 'Active leads', value: metrics.total - metrics.leased, icon: Users },
    { label: 'Leased', value: metrics.leased, icon: Award, tone: 'positive' },
  ];
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
      {stats.map((s, i) => (
        <div
          key={i}
          className={`rounded-xl border border-slate-200 bg-white px-3 py-2.5 ${
            s.tone === 'accent' ? 'ring-1 ring-offset-1 ring-amber-200' :
            s.tone === 'danger' && s.value > 0 ? 'ring-1 ring-offset-1 ring-red-200' :
            ''
          }`}
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <s.icon className="w-3 h-3" />
            <span className="truncate">{s.label}</span>
          </div>
          <div className={`text-xl font-bold tabular-nums ${s.tone === 'danger' && s.value > 0 ? 'text-red-600' : s.tone === 'positive' ? 'text-emerald-700' : 'text-brand-ink'}`}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// CALENDAR VIEW — 4-week grid showing your availability shifts (green)
// and booked tours (blue chips). Click a tour to open the lead.
// ============================================================
function CalendarView({ settings, leads, onSelectLead }) {
  const shifts = settings?.agent_availability?.shifts || [];
  const blockedDates = new Set(settings?.agent_availability?.blocked_dates || []);
  const allTours = useMemo(() => {
    const out = [];
    leads.forEach((l) => (l.tours || []).forEach((t) => {
      if (!t.date) return;
      if (t.status === 'cancelled') return;
      out.push({ ...t, lead: l });
    }));
    return out;
  }, [leads]);

  const shiftsByDate = useMemo(() => {
    const m = {};
    for (const s of shifts) (m[s.date] = m[s.date] || []).push(s);
    return m;
  }, [shifts]);
  const toursByDate = useMemo(() => {
    const m = {};
    for (const t of allTours) (m[t.date] = m[t.date] || []).push(t);
    return m;
  }, [allTours]);

  const [weekOffset, setWeekOffset] = useState(0);
  const weeks = useMemo(() => buildCalendarWeeks(4, weekOffset), [weekOffset]);
  const rangeLabel = useMemo(() => calendarRangeLabel(weeks), [weeks]);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <CalendarNav
        rangeLabel={rangeLabel}
        onPrev={() => setWeekOffset(weekOffset - 4)}
        onNext={() => setWeekOffset(weekOffset + 4)}
        onToday={() => setWeekOffset(0)}
        extra={
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300" /> Shift</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-600" /> Booked</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> Off</div>
          </div>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-[10px] uppercase tracking-wider text-slate-400 text-center font-semibold py-1">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
            {week.map((d) => {
              const dateStr = d.toISOString().slice(0, 10);
              const isPast = dateStr < todayStr;
              const isToday = dateStr === todayStr;
              const dayShifts = shiftsByDate[dateStr] || [];
              const dayTours = (toursByDate[dateStr] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
              const blocked = blockedDates.has(dateStr);
              return (
                <div
                  key={dateStr}
                  className={`min-h-[110px] rounded-lg p-1.5 text-left border ${
                    isPast ? 'bg-slate-50 border-slate-100 opacity-60' :
                    blocked ? 'bg-red-50 border-red-200' :
                    dayShifts.length > 0 ? 'bg-white border-emerald-200' :
                    'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-semibold ${isToday ? 'text-brand-gold' : 'text-slate-700'}`}>
                      {d.toLocaleDateString('en-US', { month: 'short' })} {d.getDate()}
                    </span>
                  </div>
                  {blocked && <div className="text-[10px] text-red-700 mb-1">Off</div>}
                  {!blocked && dayShifts.length > 0 && (
                    <div className="space-y-0.5 mb-1">
                      {dayShifts.map((s) => (
                        <div key={s.id} className="text-[9px] bg-emerald-100 text-emerald-800 rounded px-1 truncate">
                          {fmt24to12(s.start).replace(':00', '')}–{fmt24to12(s.end).replace(':00', '')}
                        </div>
                      ))}
                    </div>
                  )}
                  {dayTours.length > 0 && (
                    <div className="space-y-0.5">
                      {dayTours.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => onSelectLead(t.lead.id)}
                          className={`w-full text-left text-[10px] rounded px-1.5 py-0.5 font-medium truncate flex items-center gap-1 transition-colors ${
                            t.status === 'completed' ? 'bg-slate-200 text-slate-700' :
                            t.status === 'no-show' ? 'bg-amber-200 text-amber-900' :
                            'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                          title={`${t.time || ''} · ${t.lead.fullName}`}
                        >
                          <span className="font-bold">{(t.time || '').replace(':00 ', '').replace(' ', '')}</span>
                          <span className="truncate">{t.lead.fullName.split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ============================================================
// TOURS SECTION — sub-tabs for the consolidated Tours nav (calendar +
// applications). Keeps existing per-view components untouched.
// ============================================================
function ToursSection({ upcomingTours, leads, settings, onSelectLead, updateSubmissionStatus, updateLead, showToast }) {
  const [tab, setTab] = useState('calendar');
  const appsCount = leads.flatMap(l => l.submissions || []).length;
  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { k: 'calendar', label: 'Calendar' },
          { k: 'upcoming', label: 'List', count: upcomingTours.length },
          { k: 'apps', label: 'Applications', count: appsCount },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.k ? 'text-brand-ink border-brand-ink' : 'text-slate-500 border-transparent hover:text-slate-900'
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="text-[11px] text-slate-400 ml-1.5 tabular-nums">{t.count}</span>}
          </button>
        ))}
      </div>
      {tab === 'calendar' && <CalendarView settings={settings} leads={leads} onSelectLead={onSelectLead} />}
      {tab === 'upcoming' && <ToursView upcomingTours={upcomingTours} onSelectLead={onSelectLead} updateLead={updateLead} showToast={showToast} />}
      {tab === 'apps' && <SubmissionsView leads={leads} onSelectLead={onSelectLead} updateSubmissionStatus={updateSubmissionStatus} />}
    </div>
  );
}

// ============================================================
// SETTINGS SECTION — sub-tabs that pull in the formerly top-level Properties,
// Bulk SMS, and Filters views. Keeps each view as-is so we don't break them.
// ============================================================
function SettingsSection({
  settings, saveSettings, showToast,
  properties, saveProperty, removeProperty, bulkImportProperties, leads,
}) {
  const [tab, setTab] = useState('agent');
  const [templateFocus, setTemplateFocus] = useState(null); // jump-to bucket from Edit button
  const goToTemplates = (bucket) => { setTemplateFocus(bucket); setTab('templates'); };
  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {[
          { k: 'agent',      label: 'Agent & automation' },
          { k: 'templates',  label: 'Templates' },
          { k: 'blast',      label: 'Bulk SMS' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.k ? 'text-brand-ink border-brand-ink' : 'text-slate-500 border-transparent hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'agent' && (
        <div className="space-y-6">
          <CommissionSummary leads={leads} />
          <SettingsView
            settings={settings}
            saveSettings={saveSettings}
            showToast={showToast}
            tours={leads.flatMap(l => (l.tours || []).map(t => ({ ...t, lead: l })))}
            onEditTemplates={goToTemplates}
          />
        </div>
      )}
      {tab === 'templates' && (
        <TemplatesEditor
          settings={settings}
          saveSettings={saveSettings}
          showToast={showToast}
          focusBucket={templateFocus}
          onClearFocus={() => setTemplateFocus(null)}
        />
      )}
      {tab === 'blast' && <BlastView leads={leads} showToast={showToast} />}
    </div>
  );
}

// ============================================================
// TEMPLATES EDITOR — edit per-bucket welcome messages + reminder copy
// ============================================================
const TEMPLATE_BUCKETS = [
  { key: 'GCMS',   label: 'Good credit, moving <75 days',  tone: 'HOT — high priority, send curated link ASAP' },
  { key: 'GCM75+', label: 'Good credit, moving 75+ days',  tone: 'WARM — schedule a 75-day nudge' },
  { key: 'BCMS',   label: 'Limited credit, moving <75 days', tone: 'WORK WITH — flag credit options' },
  { key: 'BC75+',  label: 'Limited credit, moving 75+ days', tone: 'LONGTAIL — light touch' },
];
const TEMPLATE_PLACEHOLDERS = '{firstName}, {moveInDate}, {agentName}';

function TemplatesEditor({ settings, saveSettings, showToast, focusBucket, onClearFocus }) {
  const [form, setForm] = useState(settings);
  const [activeBucket, setActiveBucket] = useState(focusBucket || 'GCMS');
  const focusRef = useRef(null);

  useEffect(() => {
    if (focusBucket) {
      setActiveBucket(focusBucket);
      // scroll into view
      setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      onClearFocus?.();
    }
  }, [focusBucket, onClearFocus]);

  const templates = form.welcomeMessages || DEFAULT_AGENT_SETTINGS.welcomeMessages;
  const current = templates[activeBucket] || DEFAULT_AGENT_SETTINGS.welcomeMessages[activeBucket];

  const updateField = (key, value) => {
    const next = {
      ...form,
      welcomeMessages: {
        ...templates,
        [activeBucket]: { ...current, [key]: value },
      },
    };
    setForm(next);
  };
  const resetCurrent = () => {
    const next = {
      ...form,
      welcomeMessages: {
        ...templates,
        [activeBucket]: { ...DEFAULT_AGENT_SETTINGS.welcomeMessages[activeBucket] },
      },
    };
    setForm(next);
  };
  const save = async () => { await saveSettings(form); showToast('Templates saved'); };

  const segments = Math.max(1, Math.ceil((current.sms || '').length / 160));

  return (
    <div className="space-y-5 max-w-3xl" ref={focusRef}>
      <Card className="p-5 space-y-3">
        <SectionHeader icon={MessageSquare}>Welcome message templates</SectionHeader>
        <div className="text-sm text-slate-600 leading-relaxed">
          These messages send automatically when a new lead submits the intake form. Each
          bucket gets a different message based on credit score + move-in timing.
          Available placeholders: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{TEMPLATE_PLACEHOLDERS}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_BUCKETS.map((b) => (
            <button key={b.key} onClick={() => setActiveBucket(b.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeBucket === b.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}>
              {b.key}
            </button>
          ))}
        </div>
        {(() => {
          const meta = TEMPLATE_BUCKETS.find((b) => b.key === activeBucket);
          return meta ? (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-900">{meta.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{meta.tone}</div>
            </div>
          ) : null;
        })()}
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader icon={MessageSquare}>SMS</SectionHeader>
          <span className="text-[10px] text-slate-400">{(current.sms || '').length} chars · {segments} segment{segments !== 1 ? 's' : ''}</span>
        </div>
        <textarea
          value={current.sms || ''}
          onChange={(e) => updateField('sms', e.target.value)}
          rows={4}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 resize-none font-mono"
        />

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <SectionHeader icon={Mail}>Email</SectionHeader>
          <FormField label="Subject">
            <input
              value={current.emailSubject || ''}
              onChange={(e) => updateField('emailSubject', e.target.value)}
              className="form-input"
            />
          </FormField>
          <FormField label="Body">
            <textarea
              value={current.email || ''}
              onChange={(e) => updateField('email', e.target.value)}
              rows={10}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 resize-y font-mono"
            />
          </FormField>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <button onClick={resetCurrent} className="text-xs text-slate-500 hover:text-slate-900 underline">
            Reset {activeBucket} to default
          </button>
          <Button size="md" onClick={save}>Save all templates</Button>
        </div>
      </Card>

      {/* QUICK REPLY TEMPLATES — for the inbox composer */}
      <QuickReplyEditor
        templates={form.quickReplyTemplates || DEFAULT_AGENT_SETTINGS.quickReplyTemplates}
        onChange={(next) => setForm({ ...form, quickReplyTemplates: next })}
        onSave={save}
      />
      <style>{`.form-input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid rgb(226 232 240); border-radius: 0.5rem; font-size: 0.875rem; outline: none; transition: border-color 0.15s; } .form-input:focus { border-color: rgb(100 116 139); }`}</style>
    </div>
  );
}

// ============================================================
// QUICK REPLY EDITOR — manage the templates that appear in the inbox composer.
// CRUD: rename, edit body, change channel, delete, reorder, add new.
// ============================================================
function QuickReplyEditor({ templates, onChange, onSave }) {
  const [expandedId, setExpandedId] = useState(null);

  const update = (id, patch) => {
    onChange(templates.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };
  const remove = (id) => {
    if (!confirm('Delete this template?')) return;
    onChange(templates.filter((t) => t.id !== id));
  };
  const addNew = () => {
    const id = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const t = { id, label: 'New template', channel: 'sms', body: 'Hi {firstName} — ' };
    onChange([...templates, t]);
    setExpandedId(id);
  };
  const move = (id, dir) => {
    const idx = templates.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= templates.length) return;
    const next = [...templates];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onChange(next);
  };

  return (
    <Card className="p-5 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <SectionHeader icon={Zap}>Quick replies</SectionHeader>
        <Button size="sm" icon={Plus} onClick={addNew}>New template</Button>
      </div>
      <div className="text-sm text-slate-600 leading-relaxed">
        These appear in the inbox composer when you click <strong>Use template</strong>.
        Use placeholders like <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{'{firstName}'}</span>,{' '}
        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{'{portalUrl}'}</span>,{' '}
        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{'{tourDate}'}</span>,{' '}
        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{'{tourTime}'}</span>,{' '}
        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{'{agentName}'}</span>.
      </div>

      <div className="space-y-2">
        {templates.length === 0 && (
          <div className="text-xs italic text-slate-400 text-center py-6">No templates yet. Click "New template" above.</div>
        )}
        {templates.map((t, i) => {
          const open = expandedId === t.id;
          return (
            <div key={t.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50">
                <div className="flex flex-col">
                  <button onClick={() => move(t.id, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-700 disabled:opacity-30">▲</button>
                  <button onClick={() => move(t.id, 1)} disabled={i === templates.length - 1} className="text-slate-300 hover:text-slate-700 disabled:opacity-30">▼</button>
                </div>
                <button onClick={() => setExpandedId(open ? null : t.id)} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    {t.channel === 'email' ? <Mail className="w-3.5 h-3.5 text-blue-600" /> :
                     t.channel === 'both' ? <Send className="w-3.5 h-3.5 text-slate-500" /> :
                     <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />}
                    <span className="font-medium text-sm text-slate-900">{t.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">{(t.body || '').replace(/\n+/g, ' ').slice(0, 80)}</div>
                </button>
                <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-red-600 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setExpandedId(open ? null : t.id)} className="text-slate-400 hover:text-slate-900 p-1">
                  <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {open && (
                <div className="border-t border-slate-100 p-3 bg-slate-50 space-y-3">
                  <div className="flex gap-3">
                    <FormField label="Name (shown in picker)">
                      <input value={t.label} onChange={(e) => update(t.id, { label: e.target.value })} className="form-input" />
                    </FormField>
                    <div className="w-32">
                      <div className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Channel</div>
                      <select value={t.channel || 'sms'} onChange={(e) => update(t.id, { channel: e.target.value })} className="form-input">
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  </div>
                  <FormField label={`Message${t.channel === 'sms' ? ` (${(t.body || '').length} chars, ${Math.max(1, Math.ceil((t.body || '').length / 160))} segment${Math.ceil((t.body || '').length / 160) === 1 ? '' : 's'})` : ''}`}>
                    <textarea value={t.body} onChange={(e) => update(t.id, { body: e.target.value })} rows={5} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 resize-y font-mono" />
                  </FormField>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <Button size="md" onClick={onSave}>Save quick replies</Button>
      </div>
    </Card>
  );
}

// ============================================================
// PROPERTIES VIEW — manual pool of rentals + bulk CSV import + blocklist
// ============================================================

// Map of common BrightMLS / RESO CSV column names → our internal field names.
// Case-insensitive; we lowercase headers before lookup. Multiple aliases per
// field cover different export variations.
const PROPERTY_CSV_FIELDS = {
  id:                  ['listingid', 'listing id', 'mls', 'mls#', 'mls #', 'mlsnumber', 'listing key', 'listingkey'],
  mls:                 ['listingid', 'listing id', 'mls', 'mls#', 'mls #', 'mlsnumber', 'listing key', 'listingkey'],
  address:             ['streetaddress', 'street address', 'address', 'unparsedaddress', 'street name', 'streetname'],
  unit:                ['unit', 'unitnumber', 'unit number', 'unit #', 'apt'],
  neighborhood:        ['neighborhood', 'mlsareamajor', 'subdivision', 'subdivisionname', 'community'],
  city:                ['city'],
  zip:                 ['zip', 'zipcode', 'postalcode', 'postal code', 'zip code', 'postal_code', 'mailingzip', 'mailing zip', 'postalcodeplusfour', 'postalcodeplus4'],
  price:               ['listprice', 'list price', 'price', 'currentprice'],
  beds:                ['beds', 'bedrooms', 'bedroomstotal', 'bd'],
  baths:               ['baths', 'bathrooms', 'bathroomstotaldecimal', 'bathroomsfull', 'ba'],
  sqft:                ['sqft', 'sq ft', 'livingarea', 'aboveGradeFinishedArea', 'totalsqft', 'living area'],
  photos:              ['photo', 'photourl', 'photo url', 'media', 'photos', 'image', 'imageurl', 'image url'],
  list_office:         ['listofficename', 'list office name', 'list office', 'listingoffice', 'listingofficename', 'brokerage', 'office', 'companyname'],
  listing_agent:       ['listagentfullname', 'list agent', 'listingagentname', 'agent', 'agent name', 'agentname'],
  listing_agent_phone: ['listagentdirectphone', 'list agent direct phone', 'agentphone', 'agent phone'],
  leasing_contact:     ['listagentemail', 'list agent email', 'agent email', 'agentemail'],
  available_date:      ['availabilitydate', 'available date', 'availabledate', 'available'],
  pet_policy:          ['petspermitted', 'pets', 'pet policy', 'petpolicy'],
};

// Tiny CSV parser — handles quoted fields with commas and escaped quotes.
function parseCsv(text) {
  const lines = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((v) => v !== '')) lines.push(row);
        row = [];
      } else cur += c;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); if (row.some((v) => v !== '')) lines.push(row); }
  return lines;
}

function csvToProperties(csvText) {
  const rows = parseCsv(csvText.trim());
  if (rows.length === 0) return { properties: [], errors: ['No rows found in CSV'] };
  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const errors = [];

  // Build a header → field-name map by checking each PROPERTY_CSV_FIELDS aliases.
  const colMap = {};
  for (const [field, aliases] of Object.entries(PROPERTY_CSV_FIELDS)) {
    const aliasSet = new Set(aliases.map((a) => a.toLowerCase()));
    const idx = header.findIndex((h) => aliasSet.has(h));
    if (idx >= 0) colMap[field] = idx;
  }
  if (colMap.address == null) errors.push('No address column found. Looked for: ' + PROPERTY_CSV_FIELDS.address.join(', '));
  if (colMap.price == null) errors.push('No price column found. Looked for: ' + PROPERTY_CSV_FIELDS.price.join(', '));

  if (errors.length > 0) return { properties: [], errors };

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => colMap[k] != null ? String(row[colMap[k]] || '').trim() : '';
    const photoRaw = get('photos');
    const photos = photoRaw
      ? photoRaw.split(/[,;|\s]+/).map((u) => u.trim()).filter((u) => u && /^https?:\/\//.test(u))
      : [];
    const mlsId = get('id') || get('mls');
    const id = mlsId ? `p_${mlsId}` : `p_${Date.now()}_${r}_${Math.random().toString(36).slice(2, 6)}`;
    const address = get('address');
    if (!address) continue;
    // Fallback ZIP: if no dedicated zip column matched, try to extract a
    // 5-digit ZIP from the end of the address string (or anywhere in it).
    let zip = get('zip');
    if (!zip) {
      const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
      if (m) zip = m[1];
    }
    out.push({
      id,
      mls: get('mls') || null,
      source: 'brightmls',
      address,
      unit: get('unit') || null,
      neighborhood: get('neighborhood') || get('city') || null,
      zip: zip || null,
      price: parseInt(get('price').replace(/[^\d.]/g, ''), 10) || 0,
      beds: parseFloat(get('beds')) || 0,
      baths: parseFloat(get('baths')) || 0,
      sqft: get('sqft') ? parseInt(get('sqft').replace(/[^\d]/g, ''), 10) : null,
      photos,
      image: photos[0] || '',
      list_office: get('list_office') || null,
      listOffice: get('list_office') || null,
      leasingOffice: get('list_office') || null,
      listing_agent: get('listing_agent') || null,
      listingAgent: get('listing_agent') || null,
      listing_agent_phone: get('listing_agent_phone') || null,
      listingAgentPhone: get('listing_agent_phone') || null,
      leasing_contact: get('leasing_contact') || null,
      leasingContact: get('leasing_contact') || null,
      available_date: get('available_date') || null,
      availableDate: get('available_date') || null,
      pet_policy: get('pet_policy') || null,
      petPolicy: get('pet_policy') || null,
      status: 'active',
    });
  }
  return { properties: out, errors: [] };
}

function PropertiesView({ properties, saveProperty, removeProperty, bulkImportProperties, settings, saveSettings, showToast }) {
  const [tab, setTab] = useState('list');   // list | import | settings
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  // CSV import state
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState(null);     // { properties, errors }
  const [busy, setBusy] = useState(false);

  // Brokerage blocklist (lives in settings.excluded_brokerages as an array)
  const blocklist = settings.excluded_brokerages || [];
  const [blockText, setBlockText] = useState((blocklist || []).join('\n'));
  // Bright portal URLs — one per line (one or more shared "Public Portal"
  // URLs from BrightMLS Matrix). The matched-listings page links here for
  // photos. Each portal caps at ~500 listings so multiple may be needed.
  const portalUrls = settings.bright_portal_urls || (settings.bright_portal_url ? [settings.bright_portal_url] : []);
  const [portalText, setPortalText] = useState(portalUrls.join('\n'));

  const filtered = useMemo(() => {
    return (properties || [])
      .filter((p) => statusFilter === 'all' ? true : p.status === statusFilter)
      .filter((p) => !search ||
        p.address.toLowerCase().includes(search.toLowerCase()) ||
        (p.neighborhood || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.listOffice || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.mls || '').toLowerCase().includes(search.toLowerCase())
      );
  }, [properties, statusFilter, search]);

  // CSV import handlers
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setCsvText(text);
    setPreview(csvToProperties(text));
  };
  const onPaste = () => setPreview(csvToProperties(csvText));
  const onConfirmImport = async () => {
    if (!preview || preview.properties.length === 0) return;
    setBusy(true);
    const result = await bulkImportProperties(preview.properties);
    setBusy(false);
    showToast(`Imported ${result.imported} properties (${result.errors} errors)`);
    setCsvText('');
    setPreview(null);
    setTab('list');
  };

  // Blocklist save
  const onSaveBlocklist = async () => {
    const list = blockText.split('\n').map((s) => s.trim()).filter(Boolean);
    await saveSettings({ ...settings, excluded_brokerages: list });
    showToast(`Saved ${list.length} blocked brokerage${list.length === 1 ? '' : 's'}`);
  };

  const onSavePortals = async () => {
    const list = portalText.split('\n').map((s) => s.trim()).filter((s) => s && /^https?:\/\//.test(s));
    await saveSettings({ ...settings, bright_portal_urls: list, bright_portal_url: list[0] || null });
    showToast(`Saved ${list.length} portal URL${list.length === 1 ? '' : 's'}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {[
          { k: 'list', label: 'Listings', count: properties.length },
          { k: 'import', label: 'CSV Import' },
          { k: 'settings', label: 'Filters & Portals', count: blocklist.length + (settings.bright_portal_urls?.length || 0) },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === t.k ? 'text-slate-900 border-slate-900' : 'text-slate-500 border-transparent hover:text-slate-900'}`}>
            {t.label}{t.count != null && <span className="text-xs text-slate-400 ml-1.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            {['active', 'inactive', 'leased', 'all'].map((k) => (
              <button key={k} onClick={() => setStatusFilter(k)} className={`px-3 py-1 rounded-full text-xs font-medium ${statusFilter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{k}</button>
            ))}
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search address, neighborhood, brokerage…" className="flex-1 min-w-[200px] border border-slate-200 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:border-slate-400" />
            <Button size="sm" icon={Plus} onClick={() => setEditing({ status: 'active', source: 'manual', photos: [] })}>Add property</Button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Building2} title={properties.length === 0 ? 'No properties yet' : 'No matches'} desc={properties.length === 0 ? 'Import a CSV from BrightMLS or add a property manually.' : 'Try a different filter or search term.'} />
          ) : (
            <Card className="overflow-hidden">
              {filtered.map((p, i) => (
                <button key={p.id} onClick={() => setEditing(p)} className={`w-full text-left p-4 hover:bg-slate-50 flex items-center gap-4 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                  {p.image
                    ? <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4 text-slate-400" /></div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-slate-900 truncate">{p.address}</div>
                      {p.status !== 'active' && <Pill tone="neutral">{p.status}</Pill>}
                      {p.mls && <span className="text-[10px] text-slate-400 font-mono">{p.mls}</span>}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {p.neighborhood ? `${p.neighborhood} · ` : ''}{p.beds}bd · {p.baths}ba · {fmtCurrency(p.price)}/mo
                      {p.listOffice ? ` · ${p.listOffice}` : ''}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === 'import' && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-sm text-slate-700 mb-3">
              Upload a CSV exported from BrightMLS. Auto-maps standard RESO column names
              (ListingId, ListPrice, BedroomsTotal, etc.). Existing properties with the same
              MLS# are updated; new ones are inserted. Old properties stay (use status filter to archive).
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium cursor-pointer hover:bg-slate-800 inline-flex items-center gap-2">
                <Upload className="w-4 h-4" /> Choose CSV file
                <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
              </label>
              <span className="text-xs text-slate-400 self-center">or paste CSV text below</span>
            </div>
          </Card>

          <Card className="p-5">
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              placeholder="ListingId,ListPrice,StreetAddress,City,Zip,BedroomsTotal,BathroomsTotalDecimal,ListOfficeName&#10;PAPH...,2400,&quot;1420 Pine St&quot;,Philadelphia,19102,1,1,Acme Realty"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-slate-400 resize-none"
            />
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={onPaste} disabled={!csvText.trim()}>Preview parse</Button>
            </div>
          </Card>

          {preview && (
            <Card className="p-5">
              {preview.errors.length > 0 ? (
                <div className="text-sm text-red-600">
                  <div className="font-semibold mb-2">CSV parse problems:</div>
                  <ul className="list-disc pl-5 space-y-1">
                    {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              ) : (
                <>
                  <div className="text-sm mb-3">
                    <span className="font-semibold text-slate-900">{preview.properties.length}</span>
                    <span className="text-slate-500"> properties ready to import. Sample:</span>
                  </div>
                  <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                    <div className="grid grid-cols-5 gap-2 px-3 py-2 bg-slate-50 font-semibold text-slate-600">
                      <span>Address</span><span>Beds/Baths</span><span>Price</span><span>Brokerage</span><span>MLS</span>
                    </div>
                    {preview.properties.slice(0, 6).map((p, i) => (
                      <div key={i} className="grid grid-cols-5 gap-2 px-3 py-2 border-t border-slate-100 text-slate-700">
                        <span className="truncate">{p.address}</span>
                        <span>{p.beds}/{p.baths}</span>
                        <span>{fmtCurrency(p.price)}</span>
                        <span className="truncate">{p.list_office || '—'}</span>
                        <span className="font-mono text-slate-400 truncate">{p.mls || '—'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button onClick={onConfirmImport} disabled={busy}>
                      {busy ? 'Importing…' : `Import ${preview.properties.length} properties`}
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-5">
          <Card className="p-5 space-y-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-1">BrightMLS portal URLs (for photos)</div>
              <div className="text-xs text-slate-500 leading-relaxed">
                Paste one or more <strong>Matrix Public Portal</strong> URLs from BrightMLS.
                When a lead clicks &ldquo;View photos&rdquo; on a matched listing, your app
                opens this portal in a modal. The first URL is used for now —
                multi-portal smart routing comes in a later release.
                <br />
                <span className="text-slate-400">To get one: BrightMLS Matrix → run your search → Share → &ldquo;Send to client&rdquo; → copy the link.</span>
              </div>
            </div>
            <textarea
              value={portalText}
              onChange={(e) => setPortalText(e.target.value)}
              rows={4}
              placeholder="https://matrix.brightmls.com/Matrix/Public/Portal.aspx?ID=..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-400 resize-none"
            />
            <div className="flex justify-end">
              <Button onClick={onSavePortals}>Save portal URLs</Button>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-1">Blocked brokerages</div>
              <div className="text-xs text-slate-500">
                One brokerage name per line. Listings from these brokerages are hidden from
                all leads. Match is case-insensitive but otherwise exact — paste the exact name
                as it appears in BrightMLS&apos;s &ldquo;List Office Name&rdquo; field.
              </div>
            </div>
            <textarea
              value={blockText}
              onChange={(e) => setBlockText(e.target.value)}
              rows={10}
              placeholder="Acme Realty&#10;BadBroker LLC&#10;..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-400 resize-none"
            />
            <div className="flex justify-end">
              <Button onClick={onSaveBlocklist}>Save blocklist</Button>
            </div>
          </Card>
        </div>
      )}

      {editing && <PropertyFormModal property={editing} onClose={() => setEditing(null)} onSave={async (p) => { await saveProperty(p); setEditing(null); showToast('Property saved'); }} onDelete={editing.id ? async () => { if (confirm('Delete this property?')) { await removeProperty(editing.id); setEditing(null); showToast('Property deleted'); } } : null} />}
    </div>
  );
}

function PropertyFormModal({ property, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    id: property.id || '',
    mls: property.mls || '',
    address: property.address || '',
    unit: property.unit || '',
    neighborhood: property.neighborhood || '',
    zip: property.zip || '',
    price: property.price || '',
    beds: property.beds || '',
    baths: property.baths || '',
    sqft: property.sqft || '',
    photos: (property.photos || []).join('\n'),
    listOffice: property.listOffice || property.leasingOffice || '',
    listingAgent: property.listingAgent || '',
    listingAgentPhone: property.listingAgentPhone || '',
    leasingContact: property.leasingContact || '',
    availableDate: property.availableDate || '',
    petPolicy: property.petPolicy || '',
    notes: property.notes || '',
    status: property.status || 'active',
  });
  const upd = (k, v) => setForm({ ...form, [k]: v });
  const isNew = !property.id;
  const submit = async () => {
    if (!form.address || !form.price) return;
    await onSave({
      ...form,
      price: Number(form.price),
      beds: Number(form.beds),
      baths: Number(form.baths),
      sqft: form.sqft ? Number(form.sqft) : null,
      photos: form.photos.split('\n').map((s) => s.trim()).filter((s) => s && /^https?:\/\//.test(s)),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900 text-sm">{isNew ? 'Add property' : 'Edit property'}</div>
            {!isNew && <div className="text-xs text-slate-500">{form.mls || form.id}</div>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Address *"><input value={form.address} onChange={(e) => upd('address', e.target.value)} className="form-input" placeholder="1420 Pine St" /></FormField>
            <FormField label="Unit"><input value={form.unit} onChange={(e) => upd('unit', e.target.value)} className="form-input" placeholder="3B" /></FormField>
            <FormField label="Neighborhood"><input value={form.neighborhood} onChange={(e) => upd('neighborhood', e.target.value)} className="form-input" placeholder="Rittenhouse" /></FormField>
            <FormField label="ZIP"><input value={form.zip} onChange={(e) => upd('zip', e.target.value)} className="form-input" placeholder="19102" /></FormField>
            <FormField label="Price ($/mo) *"><input type="number" value={form.price} onChange={(e) => upd('price', e.target.value)} className="form-input" placeholder="2400" /></FormField>
            <FormField label="Sqft"><input type="number" value={form.sqft} onChange={(e) => upd('sqft', e.target.value)} className="form-input" placeholder="720" /></FormField>
            <FormField label="Beds *"><input type="number" step="0.5" value={form.beds} onChange={(e) => upd('beds', e.target.value)} className="form-input" placeholder="1" /></FormField>
            <FormField label="Baths *"><input type="number" step="0.5" value={form.baths} onChange={(e) => upd('baths', e.target.value)} className="form-input" placeholder="1" /></FormField>
            <FormField label="MLS #"><input value={form.mls} onChange={(e) => upd('mls', e.target.value)} className="form-input" placeholder="PAPH2301420" /></FormField>
            <FormField label="Status">
              <select value={form.status} onChange={(e) => upd('status', e.target.value)} className="form-input">
                <option value="active">Active</option>
                <option value="inactive">Inactive (hidden)</option>
                <option value="leased">Leased</option>
              </select>
            </FormField>
            <FormField label="Brokerage / List Office"><input value={form.listOffice} onChange={(e) => upd('listOffice', e.target.value)} className="form-input" placeholder="Rittenhouse Residential" /></FormField>
            <FormField label="Listing Agent"><input value={form.listingAgent} onChange={(e) => upd('listingAgent', e.target.value)} className="form-input" /></FormField>
            <FormField label="Agent Phone"><input value={form.listingAgentPhone} onChange={(e) => upd('listingAgentPhone', e.target.value)} className="form-input" /></FormField>
            <FormField label="Leasing Email"><input value={form.leasingContact} onChange={(e) => upd('leasingContact', e.target.value)} className="form-input" /></FormField>
            <FormField label="Available Date"><input type="date" value={form.availableDate || ''} onChange={(e) => upd('availableDate', e.target.value)} className="form-input" /></FormField>
            <FormField label="Pet Policy"><input value={form.petPolicy} onChange={(e) => upd('petPolicy', e.target.value)} className="form-input" placeholder="Cats OK, no dogs" /></FormField>
          </div>
          <FormField label="Photo URLs (one per line)">
            <textarea value={form.photos} onChange={(e) => upd('photos', e.target.value)} rows={3} className="form-input resize-none font-mono text-xs" placeholder="https://images.unsplash.com/..." />
          </FormField>
          <FormField label="Internal notes">
            <textarea value={form.notes} onChange={(e) => upd('notes', e.target.value)} rows={2} className="form-input resize-none" placeholder="Anything only you should see…" />
          </FormField>
          <div className="flex gap-2 pt-2">
            {onDelete && <Button variant="danger" onClick={onDelete}>Delete</Button>}
            <div className="flex-1" />
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={!form.address || !form.price}>{isNew ? 'Add property' : 'Save changes'}</Button>
          </div>
        </div>
      </div>
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
  const [editedTo, setEditedTo] = useState('');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState(null); // 'sent' | 'failed'

  // Update edited fields when activeListing changes
  useEffect(() => {
    setEditedSubject(emailSubject);
    setEditedBody(emailBody);
    setEditedTo(activeListing?.leasingContact || '');
    setSendStatus(null);
  }, [activeListing?.id]);

  const handleCopyEmail = () => {
    const toLine = editedTo ? `To: ${editedTo}\n` : '';
    const fullEmail = `${toLine}Subject: ${editedSubject}\n\n${editedBody}`;
    navigator.clipboard?.writeText(fullEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Actually send the email via Resend (logged in lead's inbox).
  const handleSendEmail = async () => {
    if (!activeListing || !editedTo) return;
    setSending(true);
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          to: editedTo,
          subject: editedSubject,
          body: editedBody,
          kind: 'application_submission',
          idempotencyKey: `submission-${lead.id}-${activeListing.id}-${Date.now()}`,
          automated: false,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSendStatus('failed');
        setSending(false);
        alert(`Email send failed: ${data.error || 'unknown error'}`);
        return;
      }
      setSendStatus('sent');
      // Still log the submission row + create follow-up tasks.
      onSubmit({
        listing: activeListing,
        landlordEmail: editedTo,
        landlordName: activeListing.listingAgent || activeListing.leasingOffice || '',
        emailSubject: editedSubject,
        emailBody: editedBody,
        sentAt: new Date().toISOString(),
        sentVia: 'resend',
      });
    } catch (err) {
      setSendStatus('failed');
      alert(`Send failed: ${err.message}`);
    }
    setSending(false);
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
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">2. Email — edit before sending</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                      <span className="text-xs text-slate-500 shrink-0">To:</span>
                      <input
                        type="email"
                        value={editedTo}
                        onChange={(e) => setEditedTo(e.target.value)}
                        placeholder="landlord@example.com"
                        className="flex-1 text-sm bg-transparent outline-none"
                      />
                    </div>
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={onClose} className="flex-1 min-w-[100px]">Cancel</Button>
            <button
              onClick={handleCopyEmail}
              disabled={!canSubmit}
              className="flex-1 min-w-[120px] py-3 rounded-full bg-slate-100 text-slate-900 text-sm font-medium hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
            >
              {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><ClipboardPaste className="w-4 h-4" /> Copy</>}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 min-w-[120px] py-3 rounded-full bg-slate-100 text-slate-900 text-sm font-medium hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
            >
              Log only
            </button>
            <button
              onClick={handleSendEmail}
              disabled={!canSubmit || !editedTo || sending}
              className="flex-1 min-w-[140px] py-3 rounded-full bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
            >
              {sending ? 'Sending…' :
                sendStatus === 'sent' ? <><Check className="w-4 h-4" /> Sent!</> :
                <><Send className="w-4 h-4" /> Send email now</>}
            </button>
          </div>
          <div className="text-xs text-slate-500 text-center mt-2">
            <strong>Send email now:</strong> delivers via your Resend address (no manual paste).<br/>
            <strong>Copy:</strong> copies the email to clipboard for manual sending in Gmail (e.g. to attach the PDF).<br/>
            <strong>Log only:</strong> records the submission without sending — for when you sent it elsewhere.
          </div>
          {lead.application && (
            <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
              <strong>Heads up:</strong> the application PDF can&apos;t be attached when sending via "Send email now". For applications that need the PDF attached, use "Copy" and send from Gmail.
            </div>
          )}
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