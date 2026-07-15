import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDy1fsJLtPKwCAhPlDyIoxeasNTySJaUFM",
  authDomain: "fungitrack-9b463.firebaseapp.com",
  projectId: "fungitrack-9b463",
  storageBucket: "fungitrack-9b463.firebasestorage.app",
  messagingSenderId: "526267708718",
  appId: "1:526267708718:web:fac0fc4c401cea129b36bf"
};

import { getAuth } from "firebase/auth";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
