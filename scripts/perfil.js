// ─────────────────────────────────────────────────────────────
// perfil.js
// Responsável por:
//   1. Verificar se o usuário está logado (senão volta ao login)
//   2. Carregar dados do perfil: nome/email do Firebase Auth,
//      bio e posição do Firestore, foto do localStorage
//   3. Alternar entre modo "visualização" e modo "edição"
//   4. Salvar nome (Auth), bio e posição (Firestore), foto (localStorage)
//
// ⚠️ Firebase Storage requer plano premium — foto fica no
//    localStorage do navegador como base64 (ideal para estudos)
// ─────────────────────────────────────────────────────────────

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, updateProfile, signOut }
    from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { doc, getDoc, setDoc }
    from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

// ── Referências aos elementos da página ──────────────────────
const viewFoto    = document.getElementById("view-foto");
const viewNome    = document.getElementById("view-nome");
const viewPosicao = document.getElementById("view-posicao");
const viewBio     = document.getElementById("view-bio");
const viewEmail   = document.getElementById("view-email");

const editNome    = document.getElementById("edit-nome");
const editBio     = document.getElementById("edit-bio");
const editPosicao = document.getElementById("edit-posicao");
const inputFoto   = document.getElementById("input-foto");
const editFotoBtn = document.getElementById("edit-foto-btn");

const secaoView   = document.getElementById("secao-view");
const secaoEdit   = document.getElementById("secao-edit");
const msgFeedback = document.getElementById("msg-feedback");

let usuarioAtual = null;

// ─────────────────────────────────────────────────────────────
// onAuthStateChanged: dispara sempre que o estado de login muda
// ─────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
        window.location.href = "index.html";
        return;
    }
    usuarioAtual = usuario;
    await carregarPerfil(usuario);
});

// ─────────────────────────────────────────────────────────────
// Carrega e exibe os dados do perfil
// ─────────────────────────────────────────────────────────────
async function carregarPerfil(usuario) {
    // ── Nome e e-mail vêm do Firebase Auth ───────────────────
    viewNome.textContent  = usuario.displayName || "Sem apelido";
    viewEmail.textContent = usuario.email;

    // ── Foto: salva no localStorage com a chave "foto-{uid}" ─
    // Assim cada usuário tem sua própria foto no dispositivo
    const fotoSalva = localStorage.getItem(`foto-${usuario.uid}`);
    if (fotoSalva) {
        viewFoto.src    = fotoSalva;
        editFotoBtn.src = fotoSalva;
    }

    // ── Bio e posição vêm do Firestore ───────────────────────
    const docRef  = doc(db, "users", usuario.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const dados = docSnap.data();
        viewBio.textContent     = dados.bio      || "Nenhuma bio ainda.";
        viewPosicao.textContent = dados.posicao  || "—";
    } else {
        viewBio.textContent     = "Nenhuma bio ainda.";
        viewPosicao.textContent = "—";
    }
}

// ─────────────────────────────────────────────────────────────
// Abre o modo edição pré-preenchendo os campos
// ─────────────────────────────────────────────────────────────
function abrirEdicao() {
    editNome.value = viewNome.textContent === "Sem apelido" ? "" : viewNome.textContent;
    editBio.value  = viewBio.textContent  === "Nenhuma bio ainda." ? "" : viewBio.textContent;

    const options = Array.from(editPosicao.options);
    const index   = options.findIndex(o => o.value === viewPosicao.textContent);
    if (index >= 0) editPosicao.selectedIndex = index;

    secaoView.classList.add("oculto");
    secaoEdit.classList.remove("oculto");
    msgFeedback.textContent = "";
}

// ─────────────────────────────────────────────────────────────
// Cancela a edição sem salvar
// ─────────────────────────────────────────────────────────────
function cancelarEdicao() {
    secaoEdit.classList.add("oculto");
    secaoView.classList.remove("oculto");
    msgFeedback.textContent = "";
}

// ─────────────────────────────────────────────────────────────
// Salva as alterações
// ─────────────────────────────────────────────────────────────
async function salvarAlteracoes() {
    const novoNome    = editNome.value.trim();
    const novaBio     = editBio.value.trim();
    const novaPosicao = editPosicao.value;
    const arquivo     = inputFoto.files[0];

    if (!novoNome) {
        mostrarFeedback("O apelido não pode ficar vazio.", "erro");
        return;
    }

    mostrarFeedback("Salvando...", "info");

    try {
        // ── Foto: converte para base64 e salva no localStorage ─
        // Não precisa de servidor nem de plano pago
        if (arquivo) {
            const base64 = await lerArquivoComoBase64(arquivo);
            // Salva com a chave "foto-{uid}" para separar por usuário
            localStorage.setItem(`foto-${usuarioAtual.uid}`, base64);
            viewFoto.src    = base64;
            editFotoBtn.src = base64;
        }

        // ── Atualiza nome no Firebase Auth ────────────────────
        await updateProfile(usuarioAtual, { displayName: novoNome });

        // ── Salva bio e posição no Firestore ──────────────────
        await setDoc(doc(db, "users", usuarioAtual.uid), {
            bio:     novaBio,
            posicao: novaPosicao
        }, { merge: true });

        // ── Atualiza a view ───────────────────────────────────
        viewNome.textContent    = novoNome;
        viewBio.textContent     = novaBio     || "Nenhuma bio ainda.";
        viewPosicao.textContent = novaPosicao || "—";

        secaoEdit.classList.add("oculto");
        secaoView.classList.remove("oculto");
        mostrarFeedback("Perfil atualizado!", "sucesso");
        setTimeout(() => { msgFeedback.textContent = ""; }, 3000);

    } catch (erro) {
        console.error(erro);
        mostrarFeedback("Erro ao salvar. Tente novamente.", "erro");
    }
}

// ─────────────────────────────────────────────────────────────
// Converte o arquivo de imagem para base64
// FileReader é uma API nativa do browser para ler arquivos locais
// ─────────────────────────────────────────────────────────────
function lerArquivoComoBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        // onload dispara quando a leitura termina
        reader.onload  = (e) => resolve(e.target.result);
        reader.onerror = reject;
        // readAsDataURL converte o arquivo para uma string base64
        reader.readAsDataURL(arquivo);
    });
}

// ─────────────────────────────────────────────────────────────
// Prévia da foto antes de salvar
// ─────────────────────────────────────────────────────────────
async function previewFoto(evento) {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    const base64 = await lerArquivoComoBase64(arquivo);
    editFotoBtn.src = base64;
}

// ─────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────
async function sair() {
    await signOut(auth);
    window.location.href = "index.html";
}

// ─────────────────────────────────────────────────────────────
// Helper de feedback
// ─────────────────────────────────────────────────────────────
function mostrarFeedback(mensagem, tipo) {
    msgFeedback.textContent = mensagem;
    msgFeedback.className   = "msg-feedback " + tipo;
}

// ─────────────────────────────────────────────────────────────
// Vincula eventos
// ─────────────────────────────────────────────────────────────
document.getElementById("btn-editar").addEventListener("click",   abrirEdicao);
document.getElementById("btn-cancelar").addEventListener("click", cancelarEdicao);
document.getElementById("btn-salvar").addEventListener("click",   salvarAlteracoes);
document.getElementById("btn-sair").addEventListener("click",     sair);
inputFoto.addEventListener("change", previewFoto);

// Clique no wrapper da foto (captura clique na imagem E no overlay da câmera)
document.getElementById("foto-edit-wrapper").addEventListener("click", () => inputFoto.click());
