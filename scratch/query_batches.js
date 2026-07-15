import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase.json', 'utf-8'));
// wait, firebase.json does not contain client config.
// I will just use admin SDK or similar. Actually, we don't have node backend.
