let tempoRestante = 600; 
let cronometro = null;
let rodando = false;
let periodoAtual = 1;
let timeSelecionado = 'home'; // Para o input de pontos customizados

const displayTempo = document.getElementById('display-timer');
const btnStart = document.getElementById('start-pause');

// Alternar seleção de time para o input customizado
document.getElementById('score-home').onclick = () => { timeSelecionado = 'home'; alert("Time CASA selecionado para pontos extras"); };
document.getElementById('score-guest').onclick = () => { timeSelecionado = 'guest'; alert("Time VISITANTE selecionado para pontos extras"); };

function formatar(segundos) {
    let min = Math.floor(Math.abs(segundos) / 60);
    let seg = Math.abs(segundos) % 60;
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
}

// AJUSTAR TEMPO MANUALMENTE (+ ou -)
function adjustTime(segundos) {
    tempoRestante += segundos;
    if (tempoRestante < 0) tempoRestante = 0;
    displayTempo.innerText = formatar(tempoRestante);
}

// CONTROLE DO TIMER
function toggleTimer() {
    if (rodando) {
        clearInterval(cronometro);
        btnStart.innerText = "INICIAR";
        rodando = false;
    } else {
        rodando = true;
        btnStart.innerText = "PAUSAR";
        cronometro = setInterval(() => {
            if (tempoRestante > 0) {
                tempoRestante--;
                displayTempo.innerText = formatar(tempoRestante);
            } else {
                clearInterval(cronometro);
                rodando = false;
                btnStart.innerText = "FIM";
                alert("FIM DO PERÍODO!");
            }
        }, 1000);
    }
}

// PONTOS E FALTAS
function addPoints(team, points) {
    const el = document.getElementById(`score-${team}`);
    let atual = parseInt(el.innerText) || 0;
    el.innerText = (atual + points).toString().padStart(2, '0');
}

function addCustom() {
    const val = parseInt(document.getElementById('input-points').value) || 0;
    addPoints(timeSelecionado, val);
}

function changeFouls(team, val) {
    const el = document.getElementById(`fouls-${team}`);
    let atual = parseInt(el.innerText) || 0;
    if (atual + val >= 0) el.innerText = atual + val;
}

// TROCAR PERÍODO
function changePeriod() {
    periodoAtual++;
    if (periodoAtual > 4) periodoAtual = 1; // Volta pro 1º ou vai pra prorrogação
    document.getElementById('display-period').innerText = periodoAtual + "º";
}

btnStart.onclick = toggleTimer;
document.getElementById('reset-timer').onclick = () => location.reload();