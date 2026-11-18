"use strict";
/**
 * Configuration. Secrets live in Google Secret Manager (set with
 * `firebase functions:secrets:set NAME`), never in this repository.
 * Plain settings live in backend/.env (copy .env.example).
 *
 * Any provider whose secret is the word "unset" is switched off: messages are
 * still written in-app and logged, but not sent on that channel.
 */
const { defineSecret, defineString, defineBoolean } = require("firebase-functions/params");

// Region: Johannesburg is the closest Google region to Kenya. Firestore,
// Storage and Functions should share it. Confirm with the lawyer (PRD N-5).
const REGION = "africa-south1";
const TZ = "Africa/Nairobi";

const params = {
  APP_URL: defineString("APP_URL", { default: "https://hexhaedge.pages.dev" }),
  REQUIRE_STAFF_MFA: defineBoolean("REQUIRE_STAFF_MFA", { default: true }),
  ENFORCE_APP_CHECK: defineBoolean("ENFORCE_APP_CHECK", { default: false }),

  MPESA_ENV: defineString("MPESA_ENV", { default: "sandbox" }), // sandbox | production
  MPESA_SHORTCODE: defineString("MPESA_SHORTCODE", { default: "174379" }),
  MPESA_TILL_OR_PAYBILL: defineString("MPESA_TILL_OR_PAYBILL", { default: "paybill" }), // paybill | till
  MPESA_PARTY_B: defineString("MPESA_PARTY_B", { default: "" }), // Till number when using a till; empty = shortcode

  AT_USERNAME: defineString("AT_USERNAME", { default: "sandbox" }),
  AT_SENDER_ID: defineString("AT_SENDER_ID", { default: "" }),
  WHATSAPP_PHONE_ID: defineString("WHATSAPP_PHONE_ID", { default: "" }),
  EMAIL_FROM: defineString("EMAIL_FROM", { default: "HexhaEdge <no-reply@example.com>" }),
  CLOUDINARY_CLOUD_NAME: defineString("CLOUDINARY_CLOUD_NAME", { default: "" }),
  CLOUDINARY_API_KEY: defineString("CLOUDINARY_API_KEY", { default: "" }),
  ADMIN_ALERT_PHONE: defineString("ADMIN_ALERT_PHONE", { default: "" }),
  ADMIN_ALERT_EMAIL: defineString("ADMIN_ALERT_EMAIL", { default: "" }),
};

const secrets = {
  MPESA_CONSUMER_KEY: defineSecret("MPESA_CONSUMER_KEY"),
  MPESA_CONSUMER_SECRET: defineSecret("MPESA_CONSUMER_SECRET"),
  MPESA_PASSKEY: defineSecret("MPESA_PASSKEY"),
  MPESA_CALLBACK_TOKEN: defineSecret("MPESA_CALLBACK_TOKEN"),
  AT_API_KEY: defineSecret("AT_API_KEY"),
  WHATSAPP_TOKEN: defineSecret("WHATSAPP_TOKEN"),
  RESEND_API_KEY: defineSecret("RESEND_API_KEY"),
  CLOUDINARY_API_SECRET: defineSecret("CLOUDINARY_API_SECRET"),
};

const MESSAGING_SECRETS = [secrets.AT_API_KEY, secrets.WHATSAPP_TOKEN, secrets.RESEND_API_KEY];
const MPESA_SECRETS = [secrets.MPESA_CONSUMER_KEY, secrets.MPESA_CONSUMER_SECRET, secrets.MPESA_PASSKEY, secrets.MPESA_CALLBACK_TOKEN];

function secretValue(s) {
  try {
    const v = s.value();
    return v && v !== "unset" ? v : "";
  } catch (e) {
    return "";
  }
}

const SERVICES = Object.freeze({
  build: "Build Your Edge",
  chamber: "Follow Your Edge",
  capital: "Execute Your Edge",
  mindspace: "Talk Your Edge",
});

const ROLES = Object.freeze(["admin", "reviewer", "trainer", "practitioner"]);

const CONSENT_PURPOSES = Object.freeze({
  terms: { label: "Terms of use", required: true },
  privacy: { label: "Privacy notice", required: true },
  clips: { label: "Recording and storage of my trading clips", service: "chamber" },
  sessions_ai: { label: "Recording of sessions and AI note-taking", service: "build" },
  share_chamber_mindspace: { label: "Sharing my record between the Chamber and MindSpace" },
  training_agreement: { label: "Training Agreement", service: "build" },
  risk_statement: { label: "Risk statement", service: "build" },
});

// Wording versions. Bump a version when the wording changes; members are asked again.
const DEFAULT_CONSENT_VERSIONS = Object.freeze({
  terms: "0.1",
  privacy: "0.1",
  clips: "0.1",
  sessions_ai: "0.1",
  share_chamber_mindspace: "0.1",
  training_agreement: "0.1",
  risk_statement: "0.1",
});

// P-8: gate rules are settings, not code.
const DEFAULT_GATES = Object.freeze({
  mindspaceFirst: { build: true, chamber: true, capital: false, mindspace: false },
  chamberNeedsPayment: true,
  buildNeedsPayment: true,
  chamberCapacity: 5,
});

// P-11 / B-9. Amounts are placeholders until confirmed (open item).
const DEFAULT_FEES = Object.freeze({
  chamberMonthlyKes: 7500,
  buildMonthlyUsd: 75,
  usdToKes: 129,          // admin sets the rate
  invoiceDaysBefore: 3,
  reminderDaysBefore: 1,
  mindspaceSessionKes: 0, // to confirm with Volin
});

const RETENTION_DEFAULTS = Object.freeze({
  clipsDays: 180,     // to set with the lawyer (N-9)
  evidenceDays: 14,   // deleted after the check unless a ruling depends on it
  notificationsDays: 365,
});

module.exports = {
  REGION,
  TZ,
  params,
  secrets,
  secretValue,
  MESSAGING_SECRETS,
  MPESA_SECRETS,
  SERVICES,
  ROLES,
  CONSENT_PURPOSES,
  DEFAULT_CONSENT_VERSIONS,
  DEFAULT_GATES,
  DEFAULT_FEES,
  RETENTION_DEFAULTS,
};
