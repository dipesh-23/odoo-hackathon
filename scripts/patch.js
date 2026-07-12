import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.resolve(__dirname, "../serviceAccountKey.json");

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function patch() {
  const depts = [
    { id: "eng", name: "Engineering", score: 0.85 },
    { id: "fac", name: "Facilities", score: 0.60 },
    { id: "fieldops", name: "Field Ops (East)", score: 0.40 }
  ];

  for (const d of depts) {
    await db.collection("departmentStats").doc(d.id).set({
      departmentName: d.name,
      utilizationScore: d.score
    }, { merge: true });
    console.log("Patched", d.name);
  }
}

patch().catch(console.error).finally(() => process.exit(0));
