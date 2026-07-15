import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDy1fsJLtPKwCAhPlDyIoxeasNTySJaUFM",
  authDomain: "fungitrack-9b463.firebaseapp.com",
  projectId: "fungitrack-9b463",
  storageBucket: "fungitrack-9b463.firebasestorage.app",
  messagingSenderId: "526267708718",
  appId: "1:526267708718:web:fac0fc4c401cea129b36bf"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testQuery() {
  try {
    const snap = await getDocs(collection(db, "insumos_base"));
    console.log(`Found ${snap.size} documents in insumos_base`);
    snap.forEach(doc => console.log(doc.id, "=>", doc.data().nombre));
  } catch (error) {
    console.error("Error querying Firestore:", error.message);
  }
}

testQuery();
