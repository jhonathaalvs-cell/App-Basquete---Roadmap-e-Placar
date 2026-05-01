// ─────────────────────────────────────────────────────────────
// firebase-config.js
// Responsável por: inicializar o Firebase e exportar os serviços
// usados em todo o app:
//   auth    → autenticação (login, cadastro)
//   db      → Firestore (banco de dados: bio, posição...)
//   storage → Firebase Storage (upload de fotos de perfil)
// ─────────────────────────────────────────────────────────────

import { initializeApp }  from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
// Storage removido: requer plano premium. Foto de perfil salva em localStorage.

const firebaseConfig = {
    apiKey:            "AIzaSyAnFYPT7vQau4wMwHNvUvr9CsASXVPlMuI",
    authDomain:        "app-basquete-b8128.firebaseapp.com",
    projectId:         "app-basquete-b8128",
    storageBucket:     "app-basquete-b8128.firebasestorage.app",
    messagingSenderId: "21216162853",
    appId:             "1:21216162853:web:4bb1747ba9e06a78693bcc"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);      // autenticação
export const db   = getFirestore(app); // banco de dados Firestore
