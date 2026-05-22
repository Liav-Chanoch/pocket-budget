import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBWdu2MTqFNEu2cjsutBiogz69t2-qK_e0",
  authDomain: "pocket-budget-manager.firebaseapp.com",
  projectId: "pocket-budget-manager",
  storageBucket: "pocket-budget-manager.firebasestorage.app",
  messagingSenderId: "211204537479",
  appId: "1:211204537479:web:be88496b18b6ce02b78c22"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
