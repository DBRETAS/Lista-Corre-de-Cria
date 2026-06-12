import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  query,
  orderBy,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ⬇️ COLE SUAS CREDENCIAIS AQUI
const firebaseConfig = {
  apiKey: "AIzaSyBeYblxeG-YbmFjNBMZKMbgwClYikZnxho",
  authDomain: "databasecdc-4b420.firebaseapp.com",
  projectId: "databasecdc-4b420",
  storageBucket: "databasecdc-4b420.firebasestorage.app",
  messagingSenderId: "563294958612",
  appId: "1:563294958612:web:d1a502e936bbe193702301",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const colecao = collection(db, "participantes");
const colecaoBans = collection(db, "banned_ips");

// ===== Separação de dados PÚBLICOS x PRIVADOS (LGPD) =====
// Público (coleção "participantes"): nome, cidade, idade, faixa etária, foto,
//   uid e telefone MASCARADO — é só o que a lista aberta precisa.
// Privado (subcoleção "participantes/<id>/privado/dados"): telefone completo,
//   e-mail e IP — apenas o próprio dono e os admins (coleção "admins")
//   conseguem ler, garantido pelas REGRAS de segurança do Firestore.
function privadoRef(participanteId) {
  return doc(db, "participantes", participanteId, "privado", "dados");
}
// Índice "indices_telefone/<numero>" com { uid }: serve só para impedir
// cadastro duplicado sem precisar baixar o telefone de ninguém.
function indiceTelefoneRef(telefoneLimpo) {
  return doc(db, "indices_telefone", telefoneLimpo);
}
function limparTelefone(tel) {
  return (tel || "").replace(/\D/g, "");
}

// Comprime imagem para base64 usando Canvas (~150x150px, qualidade 0.7)
function comprimirFotoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida."));
      img.onload = () => {
        const MAX = 150;
        let w = img.width;
        let h = img.height;
        if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
        else       { w = Math.round((w * MAX) / h); h = MAX; }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  let participantes = [];
  let isAdminUnlocked = false;
  let isDevMode = false;
  let currentUser = null; // Armazena o estado de login do usuário atual

  // Controle de acesso aos dados privados (telefone, e-mail, IP)
  let isRealAdmin = false; // a conta Google logada consta na coleção "admins" do Firestore
  let dadosPrivados = {}; // cache p/ admins: id do participante -> { telefone, email, ip }
  let meusDadosPrivados = null; // dados privados do PRÓPRIO usuário logado

  // TRAVA DE INSCRIÇÕES — limite de vagas
  const LIMITE_INSCRITOS = 30;
  let listaLiberada = false; // true quando os organizadores destravam (DEFINITIVO: não trava mais)

  const KEY_ORGANIZER_PASS = "corre_de_cria_organizer_password";
  const KEY_PERM_CLEAR = "corre_de_cria_perm_clear";
  const KEY_PERM_EXPORT = "corre_de_cria_perm_export";
  const DEV_MASTER_PASSWORD = "-Cepacol2026";

  let organizerPassword =
    localStorage.getItem(KEY_ORGANIZER_PASS) || "Caradebode2026-";
  let permClearEnabled = localStorage.getItem(KEY_PERM_CLEAR) !== "false";
  let permExportEnabled = localStorage.getItem(KEY_PERM_EXPORT) !== "false";

  // SELETORES DOM
  const formPresenca = document.getElementById("form-presenca");
  const authSection = document.getElementById("auth-section");
  const btnLoginGoogle = document.getElementById("btn-login-google");
  const btnLogout = document.getElementById("btn-logout");
  const userInfoText = document.getElementById("user-info-text");
  const btnSubmit = document.getElementById("btn-submit");

  const btnDrawRaffle = document.getElementById("btn-draw-raffle");
  const raffleResult = document.getElementById("raffle-result");
  const raffleWinnerName = document.getElementById("raffle-winner-name");
  const raffleWinnerDetails = document.getElementById("raffle-winner-details");

  // NOVOS SELETORES
  const btnToggleTheme = document.getElementById("btn-toggle-theme");
  const iconMoon = document.getElementById("icon-moon");
  const iconSun = document.getElementById("icon-sun");
  const btnShareWhatsapp = document.getElementById("btn-share-whatsapp");
  const editPresenceArea = document.getElementById("edit-presence-area");
  const btnEditPresence = document.getElementById("btn-edit-presence");
  const btnCancelPresence = document.getElementById("btn-cancel-presence");

  // ==========================================
  // TEMA CLARO / ESCURO
  // ==========================================
  const savedTheme = localStorage.getItem("cdc_theme");
  if (savedTheme === "light") {
    document.body.classList.add("light-mode");
    iconMoon.classList.add("hidden");
    iconSun.classList.remove("hidden");
  }

  btnToggleTheme.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-mode");
    iconMoon.classList.toggle("hidden", isLight);
    iconSun.classList.toggle("hidden", !isLight);
    localStorage.setItem("cdc_theme", isLight ? "light" : "dark");
  });

  // ==========================================
  // COMPARTILHAR NO WHATSAPP
  // ==========================================
  btnShareWhatsapp.addEventListener("click", () => {
    const total = participantes.length;
    const url = window.location.href;
    const texto = `🏃 *CORRE DE CRIA*\n\nJá somos *${total} confirmados* no próximo corre!\n\nConfirme sua presença agora:\n${url}\n\n_Toda segunda • 19:40 • Beira-Rio ⚡_`;
    const link = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
    window.open(link, "_blank");
  });

  const inputNome = document.getElementById("input-nome");
  const inputTelefone = document.getElementById("input-telefone");
  const inputIdade = document.getElementById("input-idade");
  const inputCidade = document.getElementById("input-cidade");
  const inputFoto = document.getElementById("input-foto");
  const fotoPreview = document.getElementById("foto-preview");
  const fotoPreviewImg = document.getElementById("foto-preview-img");
  const errorTelefone = document.getElementById("error-telefone");
  const publicTotalCount = document.getElementById("public-total-count");
  const searchInput = document.getElementById("search-input");
  const publicListGrid = document.getElementById("public-list-grid");
  const publicEmptyMessage = document.getElementById("public-empty-message");

  const btnToggleAdmin = document.getElementById("btn-toggle-admin");
  const adminPanel = document.getElementById("admin-panel");
  const btnCloseAdmin = document.getElementById("btn-close-admin");
  const adminAuthModal = document.getElementById("admin-auth-modal");
  const inputAdminPassword = document.getElementById("input-admin-password");
  const errorAdminPassword = document.getElementById("error-admin-password");
  const btnAuthCancel = document.getElementById("btn-auth-cancel");
  const btnAuthConfirm = document.getElementById("btn-auth-confirm");
  const btnCloseModal = document.getElementById("btn-close-modal");

  const adminStatTotal = document.getElementById("admin-stat-total");
  const adminStatAvgAge = document.getElementById("admin-stat-avg-age");
  const barSub18 = document.getElementById("bar-sub18");
  const barCriaAtivo = document.getElementById("bar-cria-ativo");
  const barCriaAdulto = document.getElementById("bar-cria-adulto");
  const barCriaMaster = document.getElementById("bar-cria-master");
  const countSub18 = document.getElementById("count-sub18");
  const countCriaAtivo = document.getElementById("count-cria-ativo");
  const countCriaAdulto = document.getElementById("count-cria-adulto");
  const countCriaMaster = document.getElementById("count-cria-master");

  const btnDownloadPdf = document.getElementById("btn-download-pdf");
  const btnDownloadPdfLevy = document.getElementById("btn-download-pdf-levy");
  const btnClearAll = document.getElementById("btn-clear-all");
  const adminTableBody = document.getElementById("admin-table-body");
  const adminEmptyMessage = document.getElementById("admin-empty-message");
  const adminPrivateWarning = document.getElementById("admin-private-warning");
  const btnMigrarPrivacidade = document.getElementById("btn-migrar-privacidade");

  const printDateToday = document.getElementById("print-date-today");
  const printTotalCount = document.getElementById("print-total-count");
  const printTableBody = document.getElementById("print-table-body");
  const printDateGenerated = document.getElementById("print-date-generated");

  const toastNotification = document.getElementById("toast-notification");
  const toastMessage = document.getElementById("toast-message");

  const devSettingsBox = document.getElementById("dev-settings-box");
  const devPermClear = document.getElementById("dev-perm-clear");
  const devPermExport = document.getElementById("dev-perm-export");
  const devOrganizerPassInput = document.getElementById(
    "dev-organizer-pass-input",
  );
  const btnSaveDevSettings = document.getElementById("btn-save-dev-settings");

  // SELETORES DO AVISO
  const noticeSectionCard = document.getElementById("notice-section-card");
  const noticeTextDisplay = document.getElementById("notice-text-display");
  const noticeImageDisplay = document.getElementById("notice-image-display");
  const noticeImageWrapper = document.getElementById("notice-image-wrapper");
  const devNoticeEnabled = document.getElementById("dev-notice-enabled");
  const devNoticeText = document.getElementById("dev-notice-text");
  const devNoticeImageFile = document.getElementById("dev-notice-image-file");
  const devNoticeImageLabel = document.getElementById("dev-notice-image-label");
  const devNoticeImagePreview = document.getElementById("dev-notice-image-preview");
  const devNoticeImagePreviewImg = document.getElementById("dev-notice-image-preview-img");
  const btnSaveNotice = document.getElementById("btn-save-notice");
  let devNoticeImageBase64 = null; // armazena a imagem carregada em memória

  // SELETORES DA TRAVA DE 30 INSCRITOS
  const listPausedCard = document.getElementById("list-paused-card");
  const limitControlSection = document.getElementById("limit-control-section");
  const limitStatusBadge = document.getElementById("limit-status-badge");
  const limitStatusTitle = document.getElementById("limit-status-title");
  const limitStatusDesc = document.getElementById("limit-status-desc");
  const btnToggleLimit = document.getElementById("btn-toggle-limit");

  // ==========================================
  // AUTENTICAÇÃO DE USUÁRIO (NOVO)
  // ==========================================
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      userInfoText.textContent = `${user.email}`;

      // Confere se esta conta Google está na coleção "admins" do Firestore
      await verificarAdminReal(user.uid);

      // Verifica se o usuário já tem presença cadastrada
      await verificarPresencaUsuario(user.uid);
    } else {
      currentUser = null;
      isRealAdmin = false;
      dadosPrivados = {};
      meusDadosPrivados = null;
      editPresenceArea.classList.add("hidden");
    }
    // Painel aberto? Recarrega a tabela (mostra/esconde os dados privados)
    if (isAdminUnlocked) {
      renderizarPainelAdmin();
      carregarDadosPrivadosAdmin();
    }
    // Decide o que mostrar (login, form ou aviso de lista pausada)
    atualizarAreaInscricao();
  });

  // Verifica se o usuário logado já está na lista
  async function verificarPresencaUsuario(uid) {
    // Não atualiza o form se o usuário está no meio de uma edição ativa
    const estaEditando = !!formPresenca.dataset.editId;
    const existente = participantes.find((p) => p.uid === uid);
    if (existente) {
      // Já confirmou — mostra botões de editar/cancelar
      editPresenceArea.classList.remove("hidden");
      formPresenca.dataset.editId = existente.id;
      // Busca os dados privados do PRÓPRIO usuário (telefone) p/ preencher o form
      await carregarMeusDadosPrivados(existente.id);
      if (!estaEditando) {
        // Só preenche o form automaticamente se não estava editando
        btnSubmit.querySelector("span").textContent = "ATUALIZAR PRESENÇA";
        inputNome.value = existente.nome;
        inputTelefone.value =
          (meusDadosPrivados && meusDadosPrivados.telefone) ||
          existente.telefone || // fallback p/ cadastros antigos (pré-migração)
          "";
        inputIdade.value = existente.idade;
        inputCidade.value = existente.cidade || "";
      }
    } else {
      // Ainda não confirmou
      editPresenceArea.classList.add("hidden");
      btnSubmit.querySelector("span").textContent = "CONFIRMAR NO CORRE";
      delete formPresenca.dataset.editId;
    }
  }

  // Botão editar — repopula os campos com os dados salvos do usuário
  btnEditPresence.addEventListener("click", async () => {
    if (!currentUser) return;
    const existente = participantes.find((p) => p.uid === currentUser.uid);
    if (!existente) return;

    // Garante que os dados privados (telefone) do usuário estão carregados
    await carregarMeusDadosPrivados(existente.id);

    // Preenche os campos com os dados anteriores
    inputNome.value = existente.nome;
    inputTelefone.value =
      (meusDadosPrivados && meusDadosPrivados.telefone) ||
      existente.telefone || // fallback p/ cadastros antigos (pré-migração)
      "";
    inputIdade.value = existente.idade;
    inputCidade.value = existente.cidade || "";
    formPresenca.dataset.editId = existente.id;

    // Mostra preview da foto salva, se houver
    if (existente.fotoUrl && fotoPreviewImg && fotoPreview) {
      fotoPreviewImg.src = existente.fotoUrl;
      fotoPreview.classList.remove("hidden");
    }

    // Atualiza o texto do botão de envio
    btnSubmit.querySelector("span").textContent = "ATUALIZAR PRESENÇA";

    // Remove marcações de erro residuais
    document.querySelectorAll(".input-group").forEach((el) => el.classList.remove("invalid"));

    exibirToast("Edite os campos e clique em ATUALIZAR PRESENÇA ✏️");
    inputNome.focus();
  });

  // Botão cancelar presença
  btnCancelPresence.addEventListener("click", async () => {
    const editId = formPresenca.dataset.editId;
    if (!editId || !currentUser) return;
    if (confirm("Deseja cancelar sua presença no Corre de Cria?")) {
      try {
        const existente = participantes.find((p) => p.id === editId);
        await carregarMeusDadosPrivados(editId, true);
        const telefoneAntigo = limparTelefone(
          (meusDadosPrivados && meusDadosPrivados.telefone) ||
            (existente && existente.telefone) ||
            "",
        );

        const batch = writeBatch(db);
        batch.delete(doc(db, "participantes", editId));
        // Apaga também os dados privados (se existirem)
        if (meusDadosPrivados) batch.delete(privadoRef(editId));
        // Libera o telefone no índice anti-duplicidade
        if (telefoneAntigo) {
          const refIndice = await refIndiceTelefoneApagavel(telefoneAntigo);
          if (refIndice) batch.delete(refIndice);
        }
        await batch.commit();

        meusDadosPrivados = null;
        delete formPresenca.dataset.editId;
        formPresenca.reset();
        if (inputFoto) inputFoto.value = "";
        if (fotoPreview) fotoPreview.classList.add("hidden");
        editPresenceArea.classList.add("hidden");
        btnSubmit.querySelector("span").textContent = "CONFIRMAR NO CORRE";
        exibirToast("Presença cancelada. Até a próxima! 👋");
      } catch (err) {
        alert("Erro ao cancelar presença: " + err.message);
      }
    }
  });

  btnLoginGoogle.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("Erro ao entrar com Google: " + error.message);
    }
  });

  btnLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao deslogar", error);
    }
  });

  // ESCUTA EM TEMPO REAL O FIRESTORE
  const q = query(colecao, orderBy("dataCadastro", "asc"));
  onSnapshot(q, (snapshot) => {
    participantes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    atualizarInterface();
  });

  // ==========================================
  // AVISO — escuta em tempo real o Firestore
  // ==========================================
  const noticeDocRef = doc(db, "configuracoes", "aviso");
  onSnapshot(noticeDocRef, (snap) => {
    if (!snap.exists()) {
      noticeSectionCard.classList.add("hidden");
      return;
    }
    const data = snap.data();

    // Atualiza campos do Dev se o painel estiver aberto
    if (isDevMode) {
      devNoticeEnabled.checked = !!data.ativo;
      devNoticeText.value = data.texto || "";
      // Restaura a imagem salva no preview, se existir
      if (data.imagemUrl) {
        devNoticeImageBase64 = data.imagemUrl;
        devNoticeImagePreviewImg.src = data.imagemUrl;
        devNoticeImagePreview.classList.remove("hidden");
        devNoticeImageLabel.textContent = "Imagem carregada ✓";
      } else {
        devNoticeImageBase64 = null;
        devNoticeImagePreview.classList.add("hidden");
        devNoticeImageLabel.textContent = "Escolher imagem";
      }
    }

    // Exibe o card para todos se estiver ativo
    if (data.ativo) {
      noticeTextDisplay.textContent = data.texto || "";
      if (data.imagemUrl) {
        noticeImageDisplay.src = data.imagemUrl;
        noticeImageWrapper.style.display = "";
      } else {
        noticeImageWrapper.style.display = "none";
      }
      noticeSectionCard.classList.remove("hidden");
    } else {
      // Esconde para visitantes normais; Dev sempre vê
      if (!isDevMode) {
        noticeSectionCard.classList.add("hidden");
      }
    }
  });

  // ==========================================
  // TRAVA DE 30 INSCRITOS — estado em tempo real
  // ==========================================
  const listaConfigRef = doc(db, "configuracoes", "lista");
  onSnapshot(listaConfigRef, (snap) => {
    listaLiberada = snap.exists() ? !!snap.data().liberada : false;
    atualizarAreaInscricao();
    atualizarStatusLimiteAdmin();
  });

  function listaEstaTravada() {
    return !listaLiberada && participantes.length >= LIMITE_INSCRITOS;
  }

  // Decide o que aparece na área de inscrição: login, formulário ou aviso de pausa
  function atualizarAreaInscricao() {
    const travada = listaEstaTravada();
    const jaInscrito =
      currentUser && participantes.some((p) => p.uid === currentUser.uid);

    if (travada && !jaInscrito) {
      // Lista cheia: esconde login/formulário e mostra o aviso de lista pausada
      authSection.classList.add("hidden");
      formPresenca.classList.add("hidden");
      listPausedCard.classList.remove("hidden");
    } else {
      // Fluxo normal (quem já está inscrito continua podendo editar a presença)
      listPausedCard.classList.add("hidden");
      if (currentUser) {
        authSection.classList.add("hidden");
        formPresenca.classList.remove("hidden");
      } else {
        authSection.classList.remove("hidden");
        formPresenca.classList.add("hidden");
      }
    }
  }

  // Feedback visual da trava no painel dos organizadores
  function atualizarStatusLimiteAdmin() {
    if (!limitControlSection) return;
    const total = participantes.length;
    const btnLabel = btnToggleLimit.querySelector("span");

    limitControlSection.classList.remove("limit-locked", "limit-released");

    if (listaLiberada) {
      // Destravada em DEFINITIVO: o botão some, fica somente o status
      limitControlSection.classList.add("limit-released");
      limitStatusBadge.textContent = "🔓";
      limitStatusTitle.textContent = "Lista LIBERADA em definitivo";
      limitStatusDesc.textContent = `${total} inscrito(s) no momento. Inscrições abertas para todos — a trava de ${LIMITE_INSCRITOS} não será reativada.`;
      btnToggleLimit.classList.add("hidden");
    } else if (total >= LIMITE_INSCRITOS) {
      limitControlSection.classList.add("limit-locked");
      limitStatusBadge.textContent = "🔒";
      limitStatusTitle.textContent = "Lista TRAVADA — limite de 30 atingido";
      limitStatusDesc.textContent = `${total}/${LIMITE_INSCRITOS} vagas preenchidas. Os visitantes estão vendo o aviso de lista pausada. O destravamento é definitivo.`;
      btnToggleLimit.classList.remove("hidden");
      btnLabel.textContent = "DESTRAVAR LISTA ⚡";
    } else {
      limitStatusBadge.textContent = "🛡️";
      limitStatusTitle.textContent = "Trava automática de 30 ativa";
      limitStatusDesc.textContent = `${total}/${LIMITE_INSCRITOS} vagas preenchidas. A lista trava sozinha ao chegar em ${LIMITE_INSCRITOS} inscritos.`;
      btnToggleLimit.classList.remove("hidden");
      btnLabel.textContent = "DESTRAVAR LISTA";
    }
  }

  // BOTÃO DOS ORGANIZADORES — destrava a lista em DEFINITIVO (não trava mais)
  btnToggleLimit.addEventListener("click", async () => {
    if (!isAdminUnlocked || listaLiberada) return;
    if (!exigirAdminReal("destravar a lista")) return;
    if (
      !confirm(
        "Destravar a lista?\n\nEsta ação é DEFINITIVA: a trava de 30 não será reativada e as inscrições ficam abertas para todos.",
      )
    ) {
      return;
    }
    btnToggleLimit.disabled = true;
    try {
      await setDoc(listaConfigRef, {
        liberada: true,
        atualizadoEm: new Date().toISOString(),
      });
      // Feedback visual somente para quem está no painel (o snapshot
      // atualiza o restante da interface silenciosamente para os visitantes)
      exibirToast("Lista destravada em definitivo! Inscrições abertas 🔓⚡");
    } catch (err) {
      alert("Erro ao destravar a lista: " + err.message);
    } finally {
      btnToggleLimit.disabled = false;
    }
  });

  // PREVIEW DE FOTO
  inputFoto && inputFoto.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        fotoPreviewImg.src = ev.target.result;
        fotoPreview.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    } else {
      fotoPreview.classList.add("hidden");
    }
  });

  // PREVIEW DA IMAGEM DO AVISO (Dev)
  devNoticeImageFile && devNoticeImageFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        devNoticeImageBase64 = ev.target.result;
        devNoticeImagePreviewImg.src = ev.target.result;
        devNoticeImagePreview.classList.remove("hidden");
        devNoticeImageLabel.textContent = file.name;
      };
      reader.readAsDataURL(file);
    } else {
      devNoticeImageBase64 = null;
      devNoticeImagePreview.classList.add("hidden");
      devNoticeImageLabel.textContent = "Escolher imagem";
    }
  });
  inputTelefone.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 11) value = value.substring(0, 11);
    if (value.length > 7) {
      value = value.replace(/^(\d{2})(\d{5})(\d{1,4})$/, "($1) $2-$3");
    } else if (value.length > 2) {
      value = value.replace(/^(\d{2})(\d{1,5})$/, "($1) $2");
    } else if (value.length > 0) {
      value = value.replace(/^(\d{1,2})$/, "($1");
    }
    e.target.value = value;
  });

  function validarTelefone(tel) {
    const digits = tel.replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 11) return false;
    const ddd = parseInt(digits.substring(0, 2));
    if (ddd < 11 || ddd > 99) return false;
    if (digits.length === 11 && digits.charAt(2) !== "9") return false;
    if (/^(\d)\1+$/.test(digits)) return false;
    return true;
  }

  function mascararTelefone(tel) {
    if (!tel) return "—";
    const d = tel.replace(/\D/g, "");
    if (d.length === 11)
      return `(${d.substring(0, 2)}) *****-${d.substring(7)}`;
    if (d.length === 10) return `(${d.substring(0, 2)}) ****-${d.substring(6)}`;
    return tel;
  }

  // ==========================================
  // ACESSO AOS DADOS PRIVADOS (telefone/e-mail/IP)
  // ==========================================

  // A conta logada está na coleção "admins"? (é isso que as REGRAS checam)
  async function verificarAdminReal(uid) {
    try {
      const snap = await getDoc(doc(db, "admins", uid));
      isRealAdmin = snap.exists();
    } catch (err) {
      isRealAdmin = false;
    }
  }

  // Carrega (com cache) os dados privados do PRÓPRIO usuário logado
  async function carregarMeusDadosPrivados(participanteId, forcar = false) {
    if (
      !forcar &&
      meusDadosPrivados &&
      meusDadosPrivados._id === participanteId
    ) {
      return meusDadosPrivados;
    }
    try {
      const snap = await getDoc(privadoRef(participanteId));
      meusDadosPrivados = snap.exists()
        ? { _id: participanteId, ...snap.data() }
        : null;
    } catch (err) {
      // Cadastro antigo ainda sem área privada (pré-migração) ou sem permissão
      meusDadosPrivados = null;
    }
    return meusDadosPrivados;
  }

  // Retorna a ref do índice de telefone SE ele existir e o usuário puder apagá-lo
  async function refIndiceTelefoneApagavel(telefoneLimpo) {
    if (!telefoneLimpo || !currentUser) return null;
    try {
      const snap = await getDoc(indiceTelefoneRef(telefoneLimpo));
      if (
        snap.exists() &&
        (isRealAdmin || snap.data().uid === currentUser.uid)
      ) {
        return snap.ref;
      }
    } catch (err) {
      /* índice inacessível: ignora */
    }
    return null;
  }

  // (Admins) Busca os dados privados de todos os participantes p/ o painel
  async function carregarDadosPrivadosAdmin() {
    if (!isAdminUnlocked || !isRealAdmin || !currentUser) return;
    // Remove do cache quem saiu da lista
    const idsAtuais = new Set(participantes.map((p) => p.id));
    Object.keys(dadosPrivados).forEach((id) => {
      if (!idsAtuais.has(id)) delete dadosPrivados[id];
    });
    // Busca só o que falta ou o que mudou (ex.: participante editou o telefone)
    const pendentes = participantes.filter((p) => {
      const cache = dadosPrivados[p.id];
      if (!cache) return true;
      return (
        p.telefoneMascarado &&
        cache.telefone &&
        mascararTelefone(cache.telefone) !== p.telefoneMascarado
      );
    });
    if (pendentes.length === 0) return;
    await Promise.all(
      pendentes.map(async (p) => {
        try {
          const snap = await getDoc(privadoRef(p.id));
          if (snap.exists()) dadosPrivados[p.id] = snap.data();
        } catch (err) {
          /* sem permissão ou doc inexistente: segue sem os dados */
        }
      }),
    );
    if (isAdminUnlocked) renderizarTabelaAdmin();
  }

  // Acessores com fallback p/ cadastros antigos (campos ainda no doc público)
  function obterTelefone(p) {
    const priv = dadosPrivados[p.id];
    return (priv && priv.telefone) || p.telefone || null;
  }
  function obterTelefoneMascarado(p) {
    const tel = obterTelefone(p);
    if (tel) return mascararTelefone(tel);
    return p.telefoneMascarado || "—";
  }
  function obterEmail(p) {
    const priv = dadosPrivados[p.id];
    return (priv && priv.email) || p.emailAtrelado || "";
  }
  function obterIp(p) {
    const priv = dadosPrivados[p.id];
    return (priv && priv.ip) || p.ip || "";
  }

  // Ações que dependem das regras exigem conta Google na coleção "admins"
  function exigirAdminReal(acao) {
    if (currentUser && isRealAdmin) return true;
    const mensagem = `Para ${acao}, entre no site com uma conta Google cadastrada na coleção "admins" do Firestore.`;
    throw new Error(mensagem);
  }

  function validarNome(nome) {
    const partes = nome.trim().split(/\s+/);
    return partes.length >= 2 && partes.every((p) => p.length >= 2);
  }

  function validarIdade(idade) {
    const n = parseInt(idade, 10);
    return !isNaN(n) && n >= 5 && n <= 100;
  }

  function classificarFaixaEtaria(idade) {
    const n = parseInt(idade, 10);
    if (n < 18) return "Cria Sub-18 (Mirim)";
    if (n <= 29) return "Cria 18-29 (Ativo)";
    if (n <= 45) return "Cria 30-45 (Adulto)";
    return "Cria 46+ (Master)";
  }

  function formatarCapitalize(str) {
    return str
      .toLowerCase()
      .replace(/(^\w{1})|(\s+\w{1})/g, (l) => l.toUpperCase());
  }

  // SUBMISSÃO — salva no Firestore (dados públicos e privados SEPARADOS)
  formPresenca.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser) {
      alert("Faça login para confirmar presença.");
      return;
    }

    // TRAVA DE 30: bloqueia NOVAS inscrições com a lista travada
    // (quem já está inscrito continua podendo atualizar os próprios dados)
    if (!formPresenca.dataset.editId && listaEstaTravada()) {
      atualizarAreaInscricao(); // troca o formulário pelo aviso de lista pausada
      return;
    }

    const nomeVal = inputNome.value.trim();
    const telVal = inputTelefone.value.trim();
    const idadeVal = inputIdade.value.trim();
    const cidadeVal = inputCidade.value.trim();
    let isValido = true;

    if (!validarNome(nomeVal)) {
      inputNome.parentElement.parentElement.classList.add("invalid");
      isValido = false;
    } else {
      inputNome.parentElement.parentElement.classList.remove("invalid");
    }

    if (!validarTelefone(telVal)) {
      errorTelefone.textContent =
        "Insira um número válido (DDD real + número).";
      inputTelefone.parentElement.parentElement.classList.add("invalid");
      isValido = false;
    } else {
      inputTelefone.parentElement.parentElement.classList.remove("invalid");
    }

    if (!validarIdade(idadeVal)) {
      inputIdade.parentElement.parentElement.classList.add("invalid");
      isValido = false;
    } else {
      inputIdade.parentElement.parentElement.classList.remove("invalid");
    }

    if (!cidadeVal || cidadeVal.length < 2) {
      inputCidade.parentElement.parentElement.classList.add("invalid");
      isValido = false;
    } else {
      inputCidade.parentElement.parentElement.classList.remove("invalid");
    }

    if (isValido) {
      btnSubmit.disabled = true;
      btnSubmit.querySelector("span").textContent = "VALIDANDO E ENVIANDO...";

      try {
        const editId = formPresenca.dataset.editId;
        const telLimpo = limparTelefone(telVal);

        // Checa duplicidade pelo ÍNDICE de telefones (uma consulta pontual,
        // sem baixar o telefone de ninguém)
        try {
          const idxSnap = await getDoc(indiceTelefoneRef(telLimpo));
          if (idxSnap.exists() && idxSnap.data().uid !== currentUser.uid) {
            errorTelefone.textContent =
              "Este número já confirmou presença para o corre!";
            inputTelefone.parentElement.parentElement.classList.add("invalid");
            return;
          }
        } catch (err) {
          console.warn(
            "Não foi possível checar duplicidade de telefone. Prosseguindo...",
          );
        }

        // Tenta pegar o IP para proteção contra trolls
        let userIp = "desconhecido";
        try {
          const res = await fetch("https://api64.ipify.org?format=json");
          const data = await res.json();
          userIp = data.ip;
        } catch (err) {
          console.warn("Não foi possível rastrear o IP. Prosseguindo...");
        }

        // Verifica se o IP está banido pelo DEV Master
        if (userIp !== "desconhecido") {
          const ipSanitizado = userIp.replace(/\//g, "_");
          const banSnap = await getDoc(doc(db, "banned_ips", ipSanitizado));
          if (banSnap.exists()) {
            alert(
              "⚠️ AÇÃO BLOQUEADA: Seu acesso foi permanentemente restrito pelos organizadores por comportamento inadequado.",
            );
            return;
          }
        }

        // Comprime e converte foto para base64 (sem Firebase Storage)
        let fotoUrl = null;
        const fotoFile = inputFoto && inputFoto.files[0];
        if (fotoFile) {
          fotoUrl = await comprimirFotoParaBase64(fotoFile);
        }

        if (editId) {
          // MODO EDIÇÃO — atualiza público + privado numa única operação atômica
          const participanteExistente = participantes.find(
            (p) => p.id === editId,
          );
          await carregarMeusDadosPrivados(editId, true);

          const telefoneAntigo = limparTelefone(
            (meusDadosPrivados && meusDadosPrivados.telefone) ||
              (participanteExistente && participanteExistente.telefone) ||
              "",
          );

          const batch = writeBatch(db);
          // Documento PÚBLICO: sem telefone, e-mail nem IP
          batch.set(doc(db, "participantes", editId), {
            nome: formatarCapitalize(nomeVal),
            idade: parseInt(idadeVal, 10),
            cidade: formatarCapitalize(cidadeVal),
            faixaEtaria: classificarFaixaEtaria(idadeVal),
            dataCadastro:
              participanteExistente?.dataCadastro || new Date().toISOString(),
            uid: currentUser.uid,
            fotoUrl: fotoUrl || participanteExistente?.fotoUrl || null,
            telefoneMascarado: mascararTelefone(telVal),
          });
          // Documento PRIVADO: só o dono e os admins leem (regras do Firestore)
          batch.set(privadoRef(editId), {
            telefone: telVal,
            email: currentUser.email || "desconhecido",
            ip:
              (meusDadosPrivados && meusDadosPrivados.ip) ||
              participanteExistente?.ip ||
              userIp,
            uid: currentUser.uid,
          });
          // Atualiza o índice anti-duplicidade se o telefone mudou
          if (telefoneAntigo && telefoneAntigo !== telLimpo) {
            const refAntigo = await refIndiceTelefoneApagavel(telefoneAntigo);
            if (refAntigo) batch.delete(refAntigo);
          }
          batch.set(indiceTelefoneRef(telLimpo), { uid: currentUser.uid });
          await batch.commit();
          meusDadosPrivados = null; // força recarregar os dados atualizados
          exibirToast("Presença atualizada com sucesso! ✏️⚡");
        } else {
          // MODO NOVO CADASTRO
          // Reconfere a trava (caso a 30ª vaga tenha sido preenchida enquanto enviava)
          if (listaEstaTravada()) {
            atualizarAreaInscricao();
            return;
          }
          const novoRef = doc(colecao); // gera um ID novo p/ usar no batch
          const batch = writeBatch(db);
          // Documento PÚBLICO: sem telefone, e-mail nem IP
          batch.set(novoRef, {
            nome: formatarCapitalize(nomeVal),
            idade: parseInt(idadeVal, 10),
            cidade: formatarCapitalize(cidadeVal),
            faixaEtaria: classificarFaixaEtaria(idadeVal),
            dataCadastro: new Date().toISOString(),
            uid: currentUser.uid,
            fotoUrl: fotoUrl,
            telefoneMascarado: mascararTelefone(telVal),
          });
          // Documento PRIVADO: só o dono e os admins leem (regras do Firestore)
          batch.set(privadoRef(novoRef.id), {
            telefone: telVal,
            email: currentUser.email || "desconhecido",
            ip: userIp,
            uid: currentUser.uid,
          });
          batch.set(indiceTelefoneRef(telLimpo), { uid: currentUser.uid });
          await batch.commit();
          exibirToast("Presença confirmada no Corre! Corre de Cria ⚡");
        }
        formPresenca.reset();
        if (inputFoto) inputFoto.value = "";
        if (fotoPreview) fotoPreview.classList.add("hidden");
        document
          .querySelectorAll(".input-group")
          .forEach((el) => el.classList.remove("invalid"));
      } catch (err) {
        alert("Erro ao salvar presença: " + err.message);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.querySelector("span").textContent = "CONFIRMAR NO CORRE";
      }
    }
  });

  inputNome.addEventListener("input", () =>
    inputNome.parentElement.parentElement.classList.remove("invalid"),
  );
  inputTelefone.addEventListener("input", () =>
    inputTelefone.parentElement.parentElement.classList.remove("invalid"),
  );
  inputIdade.addEventListener("input", () =>
    inputIdade.parentElement.parentElement.classList.remove("invalid"),
  );
  inputCidade.addEventListener("input", () =>
    inputCidade.parentElement.parentElement.classList.remove("invalid"),
  );

  // RENDERIZAÇÃO
  function atualizarInterface() {
    const busca = searchInput.value.toLowerCase().trim();
    const filtrados = participantes.filter((p) =>
      p.nome.toLowerCase().includes(busca),
    );
    renderizarListaPublica(filtrados);
    publicTotalCount.textContent = participantes.length;
    if (isAdminUnlocked) {
      renderizarPainelAdmin();
      carregarDadosPrivadosAdmin();
    }
    // Re-verifica presença do usuário logado sempre que a lista atualizar
    if (currentUser) verificarPresencaUsuario(currentUser.uid);
    // Reavalia a trava de 30 sempre que a lista mudar (trava/destrava em tempo real)
    atualizarAreaInscricao();
    atualizarStatusLimiteAdmin();
  }

  function renderizarListaPublica(lista) {
    publicListGrid.innerHTML = "";
    if (lista.length === 0) {
      publicEmptyMessage.classList.remove("hidden");
      return;
    }
    publicEmptyMessage.classList.add("hidden");
    lista.forEach((p, index) => {
      const card = document.createElement("div");
      card.className = "runner-card-pub";
      const badgeCompacto = p.faixaEtaria.split(" ")[1] || p.faixaEtaria;
      const avatarHtml = p.fotoUrl
        ? `<img src="${p.fotoUrl}" alt="Foto de ${p.nome}" class="runner-avatar" />`
        : `<div class="runner-avatar-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
      const cidadeHtml = p.cidade
        ? `<span class="runner-cidade">${p.cidade}</span>`
        : "";
      card.innerHTML = `
                <div class="runner-info-left">
                    <span class="runner-number">${index + 1}</span>
                    ${avatarHtml}
                    <div class="runner-name-group">
                      <span class="runner-name">${p.nome}</span>
                      ${cidadeHtml}
                    </div>
                </div>
                <span class="runner-badge-age">${badgeCompacto}</span>
            `;
      publicListGrid.appendChild(card);
    });
  }

  searchInput.addEventListener("input", () => atualizarInterface());

  // AUTENTICAÇÃO ADMIN
  btnToggleAdmin.addEventListener("click", () => {
    if (isAdminUnlocked) fecharAreaAdmin();
    else abrirModalSenha();
  });
  btnCloseAdmin.addEventListener("click", () => fecharAreaAdmin());

  function abrirModalSenha() {
    adminAuthModal.classList.remove("hidden");
    inputAdminPassword.value = "";
    errorAdminPassword.classList.add("hidden");
    inputAdminPassword.focus();
  }

  function fecharModalSenha() {
    adminAuthModal.classList.add("hidden");
    inputAdminPassword.value = "";
    errorAdminPassword.classList.add("hidden");
  }

  btnAuthCancel.addEventListener("click", fecharModalSenha);
  btnCloseModal.addEventListener("click", fecharModalSenha);
  btnAuthConfirm.addEventListener("click", processarAutenticacao);
  inputAdminPassword.addEventListener("keypress", (e) => {
    if (e.key === "Enter") processarAutenticacao();
  });

  function processarAutenticacao() {
    const senha = inputAdminPassword.value;
    if (senha === DEV_MASTER_PASSWORD) {
      isAdminUnlocked = true;
      isDevMode = true;
      fecharModalSenha();
      btnToggleAdmin.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg><span>Dev Master 🛠️</span>`;
      btnToggleAdmin.classList.replace("btn-secondary-outline", "btn-primary");
      adminPanel.classList.remove("hidden");
      devSettingsBox.classList.remove("hidden");
      devPermClear.checked = permClearEnabled;
      devPermExport.checked = permExportEnabled;
      devOrganizerPassInput.value = organizerPassword;
      // Dev sempre vê o card de aviso (para poder editar)
      noticeSectionCard.classList.remove("hidden");
      adminPanel.scrollIntoView({ behavior: "smooth" });
      renderizarPainelAdmin();
      carregarDadosPrivadosAdmin();
      exibirToast("Acesso de DESENVOLVEDOR MASTER liberado! 🛠️⚡");
    } else if (senha === organizerPassword) {
      isAdminUnlocked = true;
      isDevMode = false;
      fecharModalSenha();
      btnToggleAdmin.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg><span>Organizador 🔓</span>`;
      btnToggleAdmin.classList.replace("btn-secondary-outline", "btn-primary");
      adminPanel.classList.remove("hidden");
      devSettingsBox.classList.add("hidden");
      adminPanel.scrollIntoView({ behavior: "smooth" });
      renderizarPainelAdmin();
      carregarDadosPrivadosAdmin();
      exibirToast("Painel de Organizadores liberado! 🔒🔑");
    } else {
      errorAdminPassword.classList.remove("hidden");
      inputAdminPassword.parentElement.classList.add("invalid");
    }
  }

  inputAdminPassword.addEventListener("input", () => {
    errorAdminPassword.classList.add("hidden");
    inputAdminPassword.parentElement.classList.remove("invalid");
  });

  function fecharAreaAdmin() {
    isAdminUnlocked = false;
    isDevMode = false;
    btnToggleAdmin.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg><span>Organizador 🔒</span>`;
    btnToggleAdmin.classList.replace("btn-primary", "btn-secondary-outline");
    adminPanel.classList.add("hidden");
    devSettingsBox.classList.add("hidden");
    // Esconde o aviso se estiver inativo (só Dev vê quando inativo)
    if (devNoticeEnabled && !devNoticeEnabled.checked) {
      noticeSectionCard.classList.add("hidden");
    }
  }

  // PAINEL ADMIN
  function renderizarPainelAdmin() {
    adminStatTotal.textContent = participantes.length;
    if (participantes.length === 0) {
      adminStatAvgAge.textContent = "0";
    } else {
      const soma = participantes.reduce((s, p) => s + p.idade, 0);
      adminStatAvgAge.textContent = (soma / participantes.length).toFixed(1);
    }

    let sub18 = 0,
      criaAtivo = 0,
      criaAdulto = 0,
      criaMaster = 0;
    participantes.forEach((p) => {
      if (p.idade < 18) sub18++;
      else if (p.idade <= 29) criaAtivo++;
      else if (p.idade <= 45) criaAdulto++;
      else criaMaster++;
    });

    countSub18.textContent = sub18;
    countCriaAtivo.textContent = criaAtivo;
    countCriaAdulto.textContent = criaAdulto;
    countCriaMaster.textContent = criaMaster;

    const total = participantes.length || 1;
    barSub18.style.width = `${(sub18 / total) * 100}%`;
    barCriaAtivo.style.width = `${(criaAtivo / total) * 100}%`;
    barCriaAdulto.style.width = `${(criaAdulto / total) * 100}%`;
    barCriaMaster.style.width = `${(criaMaster / total) * 100}%`;

    if (isDevMode) {
      btnDownloadPdf.disabled = false;
      btnDownloadPdf.querySelector("span").textContent = "BAIXAR RELATÓRIO PDF";
      btnDownloadPdfLevy.disabled = false;
      btnDownloadPdfLevy.querySelector("span").textContent = "PDF CORRIDA LEVY 🚐";
      btnClearAll.disabled = false;
      btnClearAll.querySelector("span").textContent = "LIMPAR LISTA SEMANAL";
    } else {
      btnDownloadPdf.disabled = !permExportEnabled;
      btnDownloadPdf.querySelector("span").textContent = permExportEnabled
        ? "BAIXAR RELATÓRIO PDF"
        : "BAIXAR PDF (BLOQUEADO PELO DEV 🔒)";
      
      btnDownloadPdfLevy.disabled = !permExportEnabled;
      btnDownloadPdfLevy.querySelector("span").textContent = permExportEnabled
        ? "PDF CORRIDA LEVY 🚐"
        : "PDF LEVY (BLOQUEADO 🔒)";

      btnClearAll.disabled = !permClearEnabled;
      btnClearAll.querySelector("span").textContent = permClearEnabled
        ? "LIMPAR LISTA SEMANAL"
        : "LIMPAR LISTA (BLOQUEADO PELO DEV 🔒)";
    }

    renderizarTabelaAdmin();
  }

  // TABELA ADMIN COM LÓGICA DE EXCLUSÃO E BANIMENTO
  function renderizarTabelaAdmin() {
    adminTableBody.innerHTML = "";
    const thAcoes = document.querySelector(".admin-table thead th:last-child");
    if (thAcoes) {
      thAcoes.style.display = isDevMode ? "table-cell" : "none";
    }

    // Aviso quando o admin do painel não tem acesso aos dados privados
    if (adminPrivateWarning) {
      if (isRealAdmin || participantes.length === 0) {
        adminPrivateWarning.classList.add("hidden");
      } else {
        adminPrivateWarning.classList.remove("hidden");
      }
    }

    if (participantes.length === 0) {
      adminEmptyMessage.classList.remove("hidden");
      return;
    }
    adminEmptyMessage.classList.add("hidden");

    participantes.forEach((p) => {
      const tr = document.createElement("tr");

      // Botões renderizados SOMENTE para Desenvolvedor
      const deleteBtnHtml = isDevMode
        ? `
                <td style="text-align: center; display: flex; justify-content: center; gap: 6px;">
                    <button class="btn-ban-row" data-id="${p.id}" title="Banir e Bloquear IP do participante">
                        <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                        </svg>
                    </button>
                    <button class="btn-delete-row" data-id="${p.id}" title="Excluir corredor">
                        <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            `
        : "";

      // Telefone: completo (admin real) ou mascarado (campo público)
      const telCompleto = obterTelefone(p);
      const telHtml = telCompleto
        ? `<a href="https://wa.me/55${telCompleto.replace(/\D/g, "")}" target="_blank" class="admin-tel-link">${telCompleto}</a>`
        : `<span title="Disponível apenas para contas autorizadas (coleção admins)">${p.telefoneMascarado || "—"} 🔒</span>`;

      tr.innerHTML = `
                <td style="font-weight: 600;">
                  ${p.nome}
                  <div style="font-size:10px; color:var(--text-muted); font-weight:normal;">${obterEmail(p) || ""}</div>
                </td>
                <td>${telHtml}</td>
                <td>${p.cidade || "-"}</td>
                <td>${p.idade} anos</td>
                <td><span class="runner-badge-age" style="display:inline-block;">${p.faixaEtaria}</span></td>
                ${deleteBtnHtml}
            `;
      adminTableBody.appendChild(tr);
    });

    if (isDevMode) {
      // Evento de Exclusão Simples
      document.querySelectorAll(".btn-delete-row").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const id = e.currentTarget.getAttribute("data-id");
          const p = participantes.find((part) => part.id === id);
          if (!p) return;
          if (!exigirAdminReal("excluir participantes")) return;
          if (confirm(`Deseja mesmo remover "${p.nome}" da lista?`)) {
            try {
              await removerParticipante(p);
              exibirToast("Participante removido com sucesso.");
            } catch (err) {
              alert("Erro ao remover: " + err.message);
            }
          }
        });
      });

      // Evento de Banimento por IP
      document.querySelectorAll(".btn-ban-row").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const id = e.currentTarget.getAttribute("data-id");
          const p = participantes.find((part) => part.id === id);
          if (!p) return;
          if (!exigirAdminReal("banir participantes")) return;

          const ipRaw = obterIp(p);
          if (!ipRaw || ipRaw === "desconhecido" || ipRaw.trim() === "") {
            alert(
              isRealAdmin
                ? `Não foi possível resgatar o IP de ${p.nome}. Você só pode excluí-lo normalmente.`
                : `O IP de ${p.nome} é um dado privado. Entre com uma conta Google cadastrada na coleção "admins" para conseguir banir.`,
            );
            return;
          }

          if (
            confirm(
              `⚠️ ALERTA DE BANIMENTO ⚠️\n\nDeseja banir o IP de "${p.nome}" PERMANENTEMENTE? Ele nunca mais conseguirá se inscrever.`,
            )
          ) {
            try {
              const ipSanitizado = ipRaw.replace(/\//g, "_");
              const batch = writeBatch(db);
              // 1. Registra o IP na coleção de banidos
              batch.set(doc(db, "banned_ips", ipSanitizado), {
                nomeBanned: p.nome,
                dataBan: new Date().toISOString(),
              });
              // 2. Remove o desordeiro (público + privado + índice)
              adicionarExclusaoAoBatch(batch, p);
              await batch.commit();
              delete dadosPrivados[p.id];

              exibirToast(`🚫 IP de ${p.nome} banido com sucesso!`);
            } catch (err) {
              alert("Erro ao aplicar banimento: " + err.message);
            }
          }
        });
      });
    }
  }

  // Monta a exclusão completa de um participante num batch (doc público + privado + índice)
  function adicionarExclusaoAoBatch(batch, p) {
    batch.delete(doc(db, "participantes", p.id));
    // Admin real pode deletar mesmo que não exista (erro é absorvido pelas regras)
    batch.delete(privadoRef(p.id));
    const tel = obterTelefone(p);
    if (tel) {
      const telLimpo = limparTelefone(tel);
      if (telLimpo) batch.delete(indiceTelefoneRef(telLimpo));
    }
  }

  async function removerParticipante(p) {
    const batch = writeBatch(db);
    adicionarExclusaoAoBatch(batch, p);
    await batch.commit();
    delete dadosPrivados[p.id];
  }

  // LIMPAR LISTA
  btnClearAll.addEventListener("click", async () => {
    if (!isDevMode && !permClearEnabled) {
      alert("⚠️ Bloqueado pelo Dev!");
      return;
    }
    if (participantes.length === 0) {
      alert("A lista já está vazia!");
      return;
    }
    if (!exigirAdminReal("limpar a lista")) return;
    if (confirm("⚠️ Apagar TODOS os confirmados?")) {
      if (confirm("Confirmar limpeza definitiva? (Não pode ser desfeita)")) {
        try {
          // Junta tudo que precisa sumir: docs públicos, privados e índices de telefone
          const refs = [];
          for (const p of participantes) {
            refs.push(doc(db, "participantes", p.id));
            refs.push(privadoRef(p.id));
          }
          try {
            const idxSnap = await getDocs(collection(db, "indices_telefone"));
            idxSnap.forEach((d) => refs.push(d.ref));
          } catch (e) {
            console.warn("Não foi possível listar índices de telefone:", e);
          }
          // Commits em lotes (limite do Firestore: 500 operações por batch)
          for (let i = 0; i < refs.length; i += 400) {
            const batch = writeBatch(db);
            refs.slice(i, i + 400).forEach((r) => batch.delete(r));
            await batch.commit();
          }
          dadosPrivados = {};
          exibirToast("Lista reiniciada com sucesso! ⚡");
        } catch (err) {
          alert("Erro ao limpar a lista: " + err.message);
        }
      }
    }
  });

  // PDF ORIGINAL
  btnDownloadPdf.addEventListener("click", () => {
    if (!isDevMode && !permExportEnabled) {
      alert("⚠️ Bloqueado pelo Dev!");
      return;
    }
    if (participantes.length === 0) {
      alert("Nenhum participante para gerar PDF!");
      return;
    }

    const dataProximoCorre = calcularDataProximoCorre();
    printDateToday.textContent = `Segunda-feira - ${formatarData(dataProximoCorre)}`;
    printTotalCount.textContent = participantes.length;
    printDateGenerated.textContent =
      new Date().toLocaleDateString("pt-BR") +
      " às " +
      new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

    printTableBody.innerHTML = "";
    participantes.forEach((p, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td style="font-weight:bold;width:40px;text-align:center;">${index + 1}</td>
                <td style="font-weight:600;text-transform:uppercase;">${p.nome}</td>
                <td style="font-family:monospace;font-size:10px;">${obterTelefoneMascarado(p)}</td>
                <td style="text-align:center;">${p.cidade || "-"}</td>
                <td style="text-align:center;">${p.idade} anos</td>
                <td style="font-weight:500;">${p.faixaEtaria}</td>
                <td style="border-bottom:1px solid #000!important;width:220px;"></td>
            `;
      printTableBody.appendChild(tr);
    });
    window.print();
  });

  // LÓGICA DO PDF EXCLUSIVO PARA LEVY
  btnDownloadPdfLevy.addEventListener("click", () => {
    if (!isDevMode && !permExportEnabled) {
      alert("⚠️ Bloqueado pelo Dev!");
      return;
    }
    if (participantes.length === 0) {
      alert("Nenhum participante para gerar PDF!");
      return;
    }

    // 1. Salva a estrutura original para não quebrar o PDF padrão de segunda-feira
    const printHeader = document.querySelector(".print-header");
    const originalHeaderHTML = printHeader.innerHTML;
    const thTelefone = document.querySelector(".print-table thead th:nth-child(3)");
    const originalThText = thTelefone.textContent;

    // 2. Substitui o cabeçalho dinamicamente pelo aviso de Levy
    printHeader.innerHTML = `
      <h1 class="print-title">CORRE DE CRIA - EDIÇÃO LEVY</h1>
      <p class="print-subtitle" style="font-weight: 700; font-size: 13px; color: #000; margin-bottom: 15px; border: 2px dashed #000; padding: 12px; border-radius: 6px; text-align: left;">
        🏃‍♂️ ATENÇÃO, CRIAS! 🏃‍♀️ Domingo, dia 14/06, tem corrida em Levy! São aqueles 5km de sempre! Vamos disponibilizar transporte GRATUITO para a galera, mas as vagas são limitadas. 🚐 Transporte: 2 vans saindo às 07h em ponto da Quadra de Areia. <br>⚠️ Regra: Somente os 30 primeiros da lista garantem a vaga na van. Corre para se inscrever!
      </p>
      <div class="print-meta-grid">
        <div><strong>Data do Corre:</strong> Domingo - 14/06</div>
        <div><strong>Horário de Saída:</strong> 07:00 em ponto</div>
        <div><strong>Ponto de Encontro:</strong> Quadra de Areia - Beira-Rio</div>
        <div><strong>Total de Confirmados:</strong> ${participantes.length}</div>
      </div>
    `;

    thTelefone.textContent = "Telefone"; // Remove a indicação "(Mascarado)"

    printDateGenerated.textContent =
      new Date().toLocaleDateString("pt-BR") + " às " +
      new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    printTableBody.innerHTML = "";
    participantes.forEach((p, index) => {
      // 3. Destaca visualmente os 30 primeiros (Vaga garantida)
      const isTop30 = index < 30;
      const rowBg = isTop30 ? "background-color: #f0fdf4;" : ""; 
      const vanStatus = isTop30 ? "🚐 Vaga na Van" : "Lista de Espera";

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td style="font-weight:bold;width:40px;text-align:center; ${rowBg}">${index + 1}</td>
                <td style="font-weight:600;text-transform:uppercase; ${rowBg}">${p.nome}</td>
                <td style="font-family:monospace;font-size:11px; ${rowBg}">${obterTelefone(p) || p.telefoneMascarado || "—"}</td>
                <td style="text-align:center; ${rowBg}">${p.cidade || "-"}</td>
                <td style="text-align:center; ${rowBg}">${p.idade} anos</td>
                <td style="font-weight:500; font-size: 10px; ${rowBg}">${p.faixaEtaria}<br><strong>${vanStatus}</strong></td>
                <td style="border-bottom:1px solid #000!important;width:150px; ${rowBg}"></td>
            `;
      printTableBody.appendChild(tr);
    });

    // 4. Aciona a janela de impressão
    window.print();

    // 5. Restaura o DOM original
    printHeader.innerHTML = originalHeaderHTML;
    thTelefone.textContent = originalThText;
  });

  function formatarData(date) {
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function calcularDataProximoCorre() {
    const agora = new Date();
    const proxima = new Date();
    let dias = (1 - agora.getDay() + 7) % 7;
    if (dias === 0) {
      const limite = new Date();
      limite.setHours(19, 40, 0, 0);
      if (agora > limite) dias = 7;
    }
    proxima.setDate(agora.getDate() + dias);
    proxima.setHours(19, 40, 0, 0);
    return proxima;
  }

  // COUNTDOWN
  const domCdDays = document.getElementById("cd-days");
  const domCdHours = document.getElementById("cd-hours");
  const domCdMin = document.getElementById("cd-min");
  const domCdSec = document.getElementById("cd-sec");

  function tickCountdown() {
    const diff = calcularDataProximoCorre().getTime() - Date.now();
    if (diff <= 0) {
      domCdDays.textContent =
        domCdHours.textContent =
        domCdMin.textContent =
        domCdSec.textContent =
          "00";
      return;
    }
    domCdDays.textContent = String(Math.floor(diff / 86400000)).padStart(
      2,
      "0",
    );
    domCdHours.textContent = String(
      Math.floor((diff % 86400000) / 3600000),
    ).padStart(2, "0");
    domCdMin.textContent = String(
      Math.floor((diff % 3600000) / 60000),
    ).padStart(2, "0");
    domCdSec.textContent = String(Math.floor((diff % 60000) / 1000)).padStart(
      2,
      "0",
    );
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // TOAST
  let toastTimeout;
  function exibirToast(msg) {
    clearTimeout(toastTimeout);
    toastMessage.textContent = msg;
    toastNotification.classList.remove("hidden");
    toastTimeout = setTimeout(
      () => toastNotification.classList.add("hidden"),
      4000,
    );
  }

  // CONFIGURAÇÕES DEV
  btnSaveDevSettings.addEventListener("click", () => {
    if (!isDevMode) return;
    const novaSenha = devOrganizerPassInput.value.trim();
    if (novaSenha.length < 3) {
      alert("Senha deve ter pelo menos 3 caracteres!");
      return;
    }
    organizerPassword = novaSenha;
    permClearEnabled = devPermClear.checked;
    permExportEnabled = devPermExport.checked;
    localStorage.setItem(KEY_ORGANIZER_PASS, organizerPassword);
    localStorage.setItem(KEY_PERM_CLEAR, permClearEnabled);
    localStorage.setItem(KEY_PERM_EXPORT, permExportEnabled);
    exibirToast("Permissões salvas! 🛠️💾");
    renderizarPainelAdmin();
  });

  // MIGRAÇÃO DE PRIVACIDADE (Dev Master + admin real)
  // Move telefone/e-mail/IP dos docs públicos para participantes/<id>/privado/dados.
  // Rodar UMA vez após publicar as novas regras do Firestore.
  btnMigrarPrivacidade &&
    btnMigrarPrivacidade.addEventListener("click", async () => {
      if (!isDevMode) return;
      if (!exigirAdminReal("migrar os dados sensíveis")) return;
      if (
        !confirm(
          "Migrar dados sensíveis?\n\nTelefone, e-mail e IP de cada participante serão movidos para a subcoleção privada (e removidos do documento público). Rode isto UMA vez, depois de publicar as novas regras do Firestore.",
        )
      ) {
        return;
      }

      const labelSpan = btnMigrarPrivacidade.querySelector("span");
      const labelOriginal = labelSpan ? labelSpan.textContent : "";
      btnMigrarPrivacidade.disabled = true;
      if (labelSpan) labelSpan.textContent = "MIGRANDO...";

      let migrados = 0;
      let jaOk = 0;
      try {
        for (const p of participantes) {
          const temSensivel =
            "telefone" in p || "emailAtrelado" in p || "ip" in p;
          if (!temSensivel) {
            jaOk++;
            continue;
          }

          const batch = writeBatch(db);
          batch.set(
            privadoRef(p.id),
            {
              telefone: p.telefone || null,
              email: p.emailAtrelado || null,
              ip: p.ip || null,
              uid: p.uid || null,
            },
            { merge: true },
          );
          batch.update(doc(db, "participantes", p.id), {
            telefone: deleteField(),
            emailAtrelado: deleteField(),
            ip: deleteField(),
            telefoneMascarado: mascararTelefone(p.telefone),
          });
          const telLimpo = limparTelefone(p.telefone);
          if (telLimpo) {
            batch.set(indiceTelefoneRef(telLimpo), { uid: p.uid || null });
          }
          await batch.commit();
          migrados++;
        }

        alert(
          `Migração concluída! ✅\n\n• Migrados agora: ${migrados}\n• Já estavam ok: ${jaOk}\n\nPara conferir: abra o site numa guia anônima, F12 → aba Network/Rede, e verifique que os documentos de participantes não trazem mais telefone, e-mail nem IP — só o "telefoneMascarado".`,
        );
        carregarDadosPrivadosAdmin();
      } catch (err) {
        alert(
          `Erro durante a migração (${migrados} já migrados): ${err.message}\n\nVocê pode clicar de novo — quem já foi migrado será pulado.`,
        );
      } finally {
        btnMigrarPrivacidade.disabled = false;
        if (labelSpan)
          labelSpan.textContent = labelOriginal || "MIGRAR DADOS SENSÍVEIS 🔐";
      }
    });

  // SALVAR AVISO (Dev Master)
  btnSaveNotice.addEventListener("click", async () => {
    if (!isDevMode) return;
    if (!exigirAdminReal("salvar o aviso")) return;
    const texto = devNoticeText.value.trim();
    const imagemUrl = devNoticeImageBase64 || null;
    const ativo = devNoticeEnabled.checked;

    try {
      await setDoc(doc(db, "configuracoes", "aviso"), {
        ativo,
        texto,
        imagemUrl,
        atualizadoEm: new Date().toISOString(),
      });

      // Sempre exibe o card no painel Dev independente do estado
      noticeTextDisplay.textContent = texto;
      if (imagemUrl) {
        noticeImageDisplay.src = imagemUrl;
        noticeImageWrapper.style.display = "";
      } else {
        noticeImageWrapper.style.display = "none";
      }
      noticeSectionCard.classList.remove("hidden");

      exibirToast(ativo ? "Aviso publicado para todos! 📢" : "Aviso salvo (oculto para visitantes) 🔒");
    } catch (err) {
      alert("Erro ao salvar aviso: " + err.message);
    }
  });

  // LÓGICA DE SORTEIO
  btnDrawRaffle.addEventListener("click", () => {
    if (participantes.length === 0) {
      alert(
        "Não há nenhum atleta confirmado na lista para realizar o sorteio!",
      );
      return;
    }
    raffleResult.classList.remove("hidden");
    btnDrawRaffle.disabled = true;
    btnDrawRaffle.querySelector("span").textContent = "SORTEANDO...";

    let counter = 0;
    const maxTicks = 20;

    const interval = setInterval(() => {
      const randomTempIndex = Math.floor(Math.random() * participantes.length);
      const tempWinner = participantes[randomTempIndex];

      raffleWinnerName.style.color = "var(--text-secondary)";
      raffleWinnerName.textContent = tempWinner.nome;
      raffleWinnerDetails.textContent = "Girando a roleta...";
      counter++;

      if (counter >= maxTicks) {
        clearInterval(interval);
        const finalIndex = Math.floor(Math.random() * participantes.length);
        const winner = participantes[finalIndex];

        raffleWinnerName.style.color = "#4ade80";
        raffleWinnerName.textContent = winner.nome;
        raffleWinnerDetails.textContent = `${winner.faixaEtaria} • ${obterTelefone(winner) || winner.telefoneMascarado || ""}`;

        btnDrawRaffle.disabled = false;
        btnDrawRaffle.querySelector("span").textContent = "SORTEAR NOVAMENTE";
      }
    }, 80);
  });

});