// Firebase web config. These values are public by design (they identify the
// project; they are not secrets). Security comes from Firestore/Storage rules
// and the server functions. Paste yours from Firebase console → Project
// settings → Your apps → Web app.
//
// Sample data is still available on any page by adding ?demo to the address
// (for example /app/?demo=chamber), for reviewing screens.
export const firebaseConfig = {
  apiKey: "AIzaSyAp702-UlxBrsvJHWTrp_3c3ricPyQhtKM",
  authDomain: "hexhaedge-website.firebaseapp.com",
  projectId: "hexhaedge-website",
  storageBucket: "hexhaedge-website.firebasestorage.app",
  messagingSenderId: "136301545157",
  appId: "1:136301545157:web:bc0b7a482f95f20de412ac",
};
// Google Analytics (measurementId) is left out on purpose: it would need its own
// consent item and a line in the privacy notice. Add it later if wanted.

// The HexhaEdge API on Render (repository HEXHAEDGE-WEBSITE-BACKEND). No trailing slash.
export const apiBase = "https://hexhaedge-api.onrender.com";

// Optional: reCAPTCHA Enterprise site key for App Check. Leave empty to skip.
export const appCheckSiteKey = "";
