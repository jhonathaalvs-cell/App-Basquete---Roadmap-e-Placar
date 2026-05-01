// ─────────────────────────────────────────────────────────────
// cadastro.js
// Responsável por: criar uma nova conta no Firebase Auth e
// salvar o nome de exibição do jogador no perfil.
// ─────────────────────────────────────────────────────────────

import { auth } from "./firebase-config.js";

import {
    createUserWithEmailAndPassword, // cria conta com e-mail + senha
    updateProfile,                  // atualiza dados do perfil (ex: nome)
    sendEmailVerification           // envia e-mail de confirmação
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

// ─────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────

function exibirErro(mensagem) {
    const msg = document.getElementById("msg-feedback");
    msg.style.color = "#c0392b"; // vermelho
    msg.textContent = mensagem;
}

function exibirSucesso(mensagem) {
    const msg = document.getElementById("msg-feedback");
    msg.style.color = "#27ae60"; // verde
    msg.textContent = mensagem;
}

// Traduz os códigos de erro do Firebase para português
function traduzirErro(codigoFirebase) {
    const erros = {
        "auth/email-already-in-use": "Este e-mail já está cadastrado.",
        "auth/invalid-email":        "E-mail inválido.",
        "auth/weak-password":        "Senha fraca. Use no mínimo 6 caracteres."
    };
    return erros[codigoFirebase] || "Erro ao cadastrar. Tente novamente.";
}

// ─────────────────────────────────────────────────────────────
// Função principal de cadastro
// ─────────────────────────────────────────────────────────────
async function cadastrar() {
    const nome      = document.getElementById("input-nome").value.trim();
    const email     = document.getElementById("input-email").value.trim();
    const senha     = document.getElementById("input-senha").value;
    const confirmar = document.getElementById("input-confirmar").value;

    // Reseta mensagem anterior
    document.getElementById("msg-feedback").textContent = "";

    // ── Validações no front antes de chamar o Firebase ──────
    if (!nome || !email || !senha || !confirmar) {
        exibirErro("Preencha todos os campos.");
        return;
    }
    if (senha.length < 6) {
        exibirErro("A senha deve ter pelo menos 6 caracteres.");
        return;
    }
    if (senha !== confirmar) {
        exibirErro("As senhas não conferem.");
        return;
    }

    try {
        // ── Cria o usuário no Firebase Auth ──────────────────
        // createUserWithEmailAndPassword retorna uma Promise com
        // os dados da conta criada (credencial.user)
        const credencial = await createUserWithEmailAndPassword(auth, email, senha);

        // ── Salva o nome do jogador no perfil Firebase ────────
        // updateProfile atualiza campos extras do usuário logado
        await updateProfile(credencial.user, { displayName: nome });

        // ── Envia e-mail de verificação automaticamente ───────
        // O jogador recebe um link no e-mail cadastrado.
        // Enquanto não clicar, emailVerified = false no checklist da liga.
        await sendEmailVerification(credencial.user, {
            url: window.location.origin + "/liga.html" // volta para liga após verificar
        });

        exibirSucesso("Conta criada! Verifique seu e-mail antes de entrar. Redirecionando...");

        // Aguarda 1,5s para o usuário ler a mensagem, depois vai para o login
        setTimeout(() => {
            window.location.href = "index.html";
        }, 1500);

    } catch (erro) {
        // erro.code vem do Firebase (ex: "auth/email-already-in-use")
        exibirErro(traduzirErro(erro.code));
    }
}

// ─────────────────────────────────────────────────────────────
// Vincula o botão ao evento de cadastro
// ─────────────────────────────────────────────────────────────
document.getElementById("btn-cadastrar").addEventListener("click", cadastrar);
