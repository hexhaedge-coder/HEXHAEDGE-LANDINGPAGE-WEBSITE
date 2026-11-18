// Firebase web config. These values are public by design (they identify the
// project; they are not secrets). Security comes from Firestore/Storage rules
// and the server functions. Paste yours from Firebase console → Project
// settings → Your apps → Web app.
//
// While projectId is "YOUR_PROJECT_ID" the app runs in demo mode with sample
// data, so the screens can be reviewed before Firebase is set up.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "",
  appId: "",
};

// Must match REGION in backend/src/config.js
export const functionsRegion = "africa-south1";

// Optional: reCAPTCHA Enterprise site key for App Check. Leave empty to skip.
export const appCheckSiteKey = "";
