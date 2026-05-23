import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB-jIQ0Gdz3eAeF-nF83YlNIXbBzxkOVlU",
  authDomain: "pocket-budget-manager-dev.firebaseapp.com",
  projectId: "pocket-budget-manager-dev",
  storageBucket: "pocket-budget-manager-dev.firebasestorage.app",
  messagingSenderId: "276669997271",
  appId: "1:276669997271:web:791fb38cc1bec53be21092"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
