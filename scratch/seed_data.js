import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

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

async function seed() {
  console.log("🌱 Iniciando siembra de datos...");

  // 1. Insumos Base
  const insumos = [
    {
      id: "malta-ext-001",
      nombre: "Extracto de Malta",
      categoria: "Químicos/Medios",
      unidad_base: "g",
      stock_total_base: 5000,
      stock_minimo_base: 500
    },
    {
      id: "agar-agar-001",
      nombre: "Agar Agar IT",
      categoria: "Químicos/Medios",
      unidad_base: "g",
      stock_total_base: 2000,
      stock_minimo_base: 200
    },
    {
      id: "levadura-nut-001",
      nombre: "Levadura Nutricional",
      categoria: "Químicos/Medios",
      unidad_base: "g",
      stock_total_base: 1000,
      stock_minimo_base: 100
    }
  ];

  for (const i of insumos) {
    await setDoc(doc(db, "insumos_base", i.id), {
      ...i,
      createdAt: serverTimestamp()
    });
    console.log(`✅ Insumo creado: ${i.nombre}`);
  }

  // 2. Recetas
  const recetas = [
    {
      id: "agar-malta-std",
      nombre: "Agar Malta Estándar",
      categoria: "Agar",
      rendimiento_teorico: { cantidad: 1000, unidad: "ml" },
      ingredientes: [
        { insumoId: "malta-ext-001", cantidad: 20 },
        { insumoId: "agar-agar-001", cantidad: 15 }
      ],
      instrucciones: "Mezclar 1L de agua con los polvos. Autoclave 20min."
    },
    {
      id: "agar-mea-plus",
      nombre: "Agar MEA Enriquecido",
      categoria: "Agar",
      rendimiento_teorico: { cantidad: 1000, unidad: "ml" },
      ingredientes: [
        { insumoId: "malta-ext-001", cantidad: 20 },
        { insumoId: "agar-agar-001", cantidad: 18 },
        { insumoId: "levadura-nut-001", cantidad: 2 }
      ],
      instrucciones: "Mezclar y esterilizar."
    }
  ];

  for (const r of recetas) {
    await setDoc(doc(db, "recetas", r.id), {
      ...r,
      createdAt: serverTimestamp()
    });
    console.log(`✅ Receta creada: ${r.nombre}`);
  }

  console.log("✨ Datos inicializados correctamente.");
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Error seeding data:", err);
  process.exit(1);
});
