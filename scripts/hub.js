// ─────────────────────────────────────────────────────────────
// hub.js
// Carrega e exibe os posts automáticos gerados ao finalizar
// cada rodada. Os posts ficam salvos em posts/{id} no Firestore.
// ─────────────────────────────────────────────────────────────

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { collection, getDocs, query, orderBy, deleteDoc, doc }
    from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

// ── DOM ──────────────────────────────────────────────────────
const feedEl    = document.getElementById("feed-posts");
const loadingEl = document.getElementById("hub-loading");

// ─────────────────────────────────────────────────────────────
// Ponto de entrada — aguarda login
// ─────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
        window.location.href = "index.html";
        return;
    }
    await carregarPosts();
});

// ─────────────────────────────────────────────────────────────
// carregarPosts()
// Busca todos os posts ordenados do mais recente para o mais antigo
// ─────────────────────────────────────────────────────────────
async function carregarPosts() {
    try {
        const snap = await getDocs(
            query(collection(db, "posts"), orderBy("criadoEm", "desc"))
        );

        loadingEl.classList.add("oculto");

        // Remove silenciosamente posts com mais de 14 dias
        const agora = new Date();
        const expirados = snap.docs.filter(d => {
            const expira = d.data().expiraEm?.toDate?.();
            return expira && expira < agora;
        });
        await Promise.all(expirados.map(d => deleteDoc(doc(db, "posts", d.id))));

        // Só exibe os posts ainda válidos
        const validos = snap.docs.filter(d => {
            const expira = d.data().expiraEm?.toDate?.();
            return !expira || expira >= agora; // posts sem campo expiraEm também aparecem
        });

        if (validos.length === 0) {
            feedEl.innerHTML = `
                <div class="hub-vazio">
                    Nenhuma rodada finalizada ainda.<br>
                    Os posts aparecem automaticamente quando o admin registrar os resultados.
                </div>`;
            return;
        }

        validos.forEach(d => {
            const post = d.data();
            feedEl.appendChild(criarCardPost(post));
        });

    } catch (e) {
        console.error("Erro ao carregar posts:", e);
        loadingEl.textContent = "Erro ao carregar o mural.";
    }
}

// ─────────────────────────────────────────────────────────────
// criarCardPost(post)
// Converte o texto do post em um card HTML com seções visuais
// ─────────────────────────────────────────────────────────────
function criarCardPost(post) {
    const card = document.createElement("article");
    card.className = "hub-card";

    // Data formatada
    const data = post.criadoEm?.toDate?.();
    const dataStr = data
        ? data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
        : "";

    // Converte o texto em HTML — cada linha vira um parágrafo ou separador
    const linhas = post.texto.split("\n");
    let htmlCorpo = "";
    let dentroResultados = false;
    let dentroTabela     = false;

    linhas.forEach((linha, i) => {
        if (i === 0) {
            // Primeira linha = título do post (já está no cabeçalho, ignora)
            return;
        }
        if (linha.startsWith("─────")) {
            dentroResultados = false;
            dentroTabela     = false;
            return; // separador visual — não renderiza
        }
        if (linha === "Resultados") {
            dentroResultados = true;
            htmlCorpo += `<div class="hub-secao-titulo">Resultados</div><div class="hub-resultados">`;
            return;
        }
        if (linha === "Como está a tabela") {
            if (dentroResultados) htmlCorpo += `</div>`;
            dentroTabela     = true;
            dentroResultados = false;
            htmlCorpo += `<div class="hub-secao-titulo">Como está a tabela</div><div class="hub-tabela">`;
            return;
        }
        if (linha === "") {
            if (dentroResultados) { htmlCorpo += `</div>`; dentroResultados = false; }
            if (dentroTabela)     { htmlCorpo += `</div>`; dentroTabela     = false; }
            return;
        }

        if (dentroResultados) {
            // Linha de resultado: "Time A 78 x 65 Time B — frase"
            const [confronto, ...fraseParts] = linha.split(" — ");
            const frase = fraseParts.join(" — ");
            htmlCorpo += `
                <div class="hub-resultado-item">
                    <span class="hub-confronto">${confronto}</span>
                    ${frase ? `<span class="hub-frase-jogo">${frase}</span>` : ""}
                </div>`;
        } else if (dentroTabela) {
            htmlCorpo += `<div class="hub-tabela-linha">${linha}</div>`;
        } else {
            // Texto narrativo (abertura, lanternas, fechamento)
            htmlCorpo += `<p class="hub-narrativa">${linha}</p>`;
        }
    });

    // Fecha blocos abertos
    if (dentroResultados || dentroTabela) htmlCorpo += `</div>`;

    card.innerHTML = `
        <div class="hub-card-header">
            <span class="hub-liga-nome">${post.ligaNome}</span>
            <span class="hub-rodada-badge">Rodada ${post.rodada}</span>
        </div>
        <div class="hub-card-corpo">
            ${htmlCorpo}
        </div>
        ${dataStr ? `<div class="hub-card-rodape">${dataStr}</div>` : ""}
    `;

    return card;
}
