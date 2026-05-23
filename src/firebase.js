import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const devConfig = {
  apiKey: "AIzaSyB-jIQ0Gdz3eAeF-nF83YlNIXbBzxkOVlU",
  authDomain: "pocket-budget-manager-dev.firebaseapp.com",
  projectId: "pocket-budget-manager-dev",
  storageBucket: "pocket-budget-manager-dev.firebasestorage.app",
  messagingSenderId: "276669997271",
  appId: "1:276669997271:web:791fb38cc1bec53be21092"
};

const prodConfig = {
  apiKey: "AIzaSyBWdu2MTqFNEu2cjsutBiogz69t2-qK_e0",
  authDomain: "pocket-budget-manager.firebaseapp.com",
  projectId: "pocket-budget-manager",
  storageBucket: "pocket-budget-manager.firebasestorage.app",
  messagingSenderId: "211204537479",
  appId: "1:211204537479:web:be88496b18b6ce02b78c22"
};

const isDevBuild = process.env.REACT_APP_ENV === 'dev';
const firebaseConfig = isDevBuild ? devConfig : prodConfig;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Local emulator override (npm start without REACT_APP_ENV=dev)
if (process.env.NODE_ENV === 'development' && !isDevBuild) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}
