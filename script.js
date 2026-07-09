const STORAGE_KEY = "eafc26_ultimate_v4_matches";
const SHEET_URL_KEY = "eafc26_google_sheet_webapp_url";
const SUPABASE_URL_KEY = "eafc26_supabase_project_url";
const SUPABASE_ANON_KEY = "eafc26_supabase_anon_key";
const OFFLINE_QUEUE_KEY = "eafc26_offline_queue";
const ADMIN_EMAIL = "serkanmutlu2109@gmail.com";
const PLAYERS = ["Serkan","Ramazan"];
const SEASON_TARGET = 50;
let selectedSeasonNumber = null;

const aliases = [
  ["Skor", ["skor"]],
  ["Topa sahip olma", ["topa sahip","sahip olma"]],
  ["Topu geri kazanma", ["geri kazanma","topu geri"]],
  ["Şut", ["şut","sut"]],
  ["Gol beklentisi (xG)", ["gol beklent","xg"]],
  ["Pas", ["pas"]],
  ["Müdahale", ["müdahale","mudahale"]],
  ["Top kazanılan müdahale", ["top kazanılan müdahale","top kazanilan mudahale","kazanılan müdahale","kazanilan mudahale"]],
  ["Top kesme", ["top kesme","kesme"]],
  ["Kurtarış", ["kurtarış","kurtaris"]],
  ["Yapılan faul", ["faul"]],
  ["Ofsayt", ["ofsayt"]],
  ["Köşe vuruşu", ["köşe","kose","korner"]],
  ["Serbest vuruş", ["serbest"]],
  ["Penaltı", ["penalt"]],
  ["Sarı kart", ["sarı","sari"]]
];

const ORDER = ["Skor","Topa sahip olma","Topu geri kazanma","Şut","Gol beklentisi (xG)","Pas","Müdahale","Top kazanılan müdahale","Top kesme","Kurtarış","Yapılan faul","Ofsayt","Köşe vuruşu","Serbest vuruş","Penaltı","Sarı kart"];

let matches = loadMatches();
let editId = null;
let supabaseClient = null;
let realtimeChannel = null;
let presenceChannel = null;
let currentUserName = localStorage.getItem("eafc26_user_name") || "İzleyici";
let isAdmin = false;
let currentUserEmail = null;
const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page));
  });

  $("saveBtn").onclick = saveCurrentMatch;
  $("sampleBtn").onclick = fillSample;
  $("clearInputBtn").onclick = clearInput;
  $("resetBtn").onclick = resetAll;
  $("statsToolsBtn").onclick = (e) => { e.stopPropagation(); $("statsToolsMenu").classList.toggle("open"); };
  $("seasonResetOpen").onclick = () => openSeasonReset();
  $("matchResetOpen").onclick = () => openMatchReset();
  $("modalClose").onclick = closeModal;
  $("resetModal").onclick = (e) => { if(e.target.id === "resetModal") closeModal(); };
  document.addEventListener("click", () => $("statsToolsMenu")?.classList.remove("open"));
  $("exportBtn").onclick = () => exportJson(matches);
  $("importFile").onchange = async (e) => importBackup(e.target.files[0]);
  $("sheetUrlInput").value = localStorage.getItem(SHEET_URL_KEY) || "";
  $("supabaseUrlInput").value = localStorage.getItem(SUPABASE_URL_KEY) || "";
  $("supabaseAnonInput").value = localStorage.getItem(SUPABASE_ANON_KEY) || "";
  $("saveSheetUrlBtn").onclick = saveSheetUrl;
  $("testSheetBtn").onclick = testSheetConnection;
  $("syncAllBtn").onclick = syncAllMatchesToSheet;
  $("saveSupabaseBtn").onclick = saveSupabaseConfig;
  $("testSupabaseBtn").onclick = testSupabaseConnection;
  $("syncSupabaseBtn").onclick = syncAllMatchesToSupabase;
  $("loadSupabaseBtn").onclick = loadMatchesFromSupabase;
  $("adminLoginBtn").onclick = adminLogin;
  $("adminLogoutBtn").onclick = adminLogout;
  $("search").oninput = renderHistory;
  $("winnerFilter").onchange = renderHistory;
  $("sortMode").onchange = renderHistory;
  $("matchInput").addEventListener("input", renderPreview);

  initSupabaseClient();
  await initAuthState();
  await autoLoadSupabaseIfConfigured();
  render();
  renderPreview();
});

function switchPage(page){
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === page));
  render();
}

function loadMatches(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveMatches(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(matches)); }
function resetAll(){
  if(!isAdmin){ alert("Bu işlem sadece admin için açık."); return; }
  if(confirm("Tüm veriler silinsin mi?")){
    matches=[]; localStorage.removeItem(STORAGE_KEY); render(); toast("Tüm veriler sıfırlandı.");
  }
}

async function saveCurrentMatch(){
  const msg = $("message");
  const btn = $("saveBtn");

  if(!isAdmin){
    msg.textContent = "Bu işlem sadece admin için açık.";
    msg.style.color = "#fca5a5";
    return;
  }

  try{
    btn.disabled = true;
    btn.textContent = "Kaydediliyor...";
    msg.textContent = "Maç kaydediliyor...";
    msg.style.color = "#fde68a";

    const match = parseMatch($("matchInput").value);
    const wasEdit = Boolean(editId);

    if(editId){
      const i = matches.findIndex(m => m.id === editId);
      if(i >= 0){
        match.id = editId;
        match.createdAt = matches[i].createdAt;
        match.date = matches[i].date + " / düzenlendi";
        matches[i] = match;
      }
      editId = null;
    }else{
      matches.unshift(match);
    }

    $("matchInput").value = "";
    saveMatches();
    render();
    renderPreview();

    // Google Sheet yedek denemesi arka planda kalır, ana canlı sistem Supabase'tir.
    syncMatchToSheet(match);

    const syncResult = await syncMatchToSupabase(match);
    render();

    btn.textContent = "Maçı Kaydet";

    if(syncResult === "synced"){
      msg.textContent = wasEdit
        ? "✓ Maç güncellendi ve canlı siteye kaydedildi: " + scoreLine(match)
        : "✓ Maç kaydedildi ve canlı siteye gönderildi: " + scoreLine(match);
      msg.style.color = "#86efac";
      toast("Maç canlı siteye kaydedildi.");
    }else if(syncResult === "queued"){
      msg.textContent = "✓ Yerel kayıt yapıldı. İnternet/Supabase gelince otomatik gönderilecek: " + scoreLine(match);
      msg.style.color = "#fde68a";
      toast("Maç sıraya alındı.");
    }else{
      msg.textContent = "✓ Yerel kayıt yapıldı: " + scoreLine(match);
      msg.style.color = "#86efac";
      toast("Maç kaydedildi.");
    }
  }catch(e){
    msg.textContent = e.message;
    msg.style.color = "#fca5a5";
  }finally{
    btn.disabled = false;
    if(!editId) btn.textContent = "Maçı Kaydet";
  }
}

function clearInput(){
  $("matchInput").value = "";
  editId = null;
  $("saveBtn").textContent = "Maçı Kaydet";
  $("message").textContent = "";
  renderPreview();
}

function parseMatch(text){
  if(!text || !text.trim()) throw new Error("Önce istatistik metni yapıştır.");
  const rows = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.includes("|"))
    .map(l => l.split("|").map(c => c.trim()).filter(Boolean));

  if(rows.length < 2) throw new Error("Tablo bulunamadı.");

  const header = rows.find(r => r.length >= 3 && norm(r[0]).includes("istatistik"));
  if(!header) throw new Error("Başlık satırı yok: | İstatistik | Serkan | Ramazan |");

  const p1 = header[1], p2 = header[2];
  if(!p1 || !p2) throw new Error("Oyuncu isimleri okunamadı.");

  const stats = {};
  rows.forEach(r => {
    if(r.length >= 3 && !norm(r[0]).includes("istatistik")){
      const key = canonical(r[0]);
      stats[key] = {[p1]: r[1], [p2]: r[2]};
    }
  });

  if(!stats["Skor"]) throw new Error("Skor satırı zorunlu.");

  const s1 = toNumber(stats["Skor"][p1]);
  const s2 = toNumber(stats["Skor"][p2]);
  const winner = s1 > s2 ? p1 : s2 > s1 ? p2 : "Beraberlik";

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()),
    createdAt: Date.now(),
    date: new Date().toLocaleString("tr-TR"),
    players: [p1,p2],
    score: {[p1]:s1,[p2]:s2},
    winner,
    stats,
    raw:text
  };
}

function canonical(v){
  const n = norm(v);
  for(const [name, keys] of aliases){
    if(keys.some(k => n.includes(k))) return name;
  }
  return v;
}

function renderPreview(){
  const box = $("previewBox");
  const text = $("matchInput").value.trim();
  if(!text){
    box.className = "preview-box muted";
    box.innerHTML = "İstatistik metni yapıştırınca burada önizleme oluşacak.";
    return;
  }
  try{
    const m = parseMatch(text);
    const [p1,p2] = m.players;
    box.className = "preview-box";
    box.innerHTML = `
      <div class="preview-score">${scoreLine(m)}</div>
      <div class="preview-winner">🏆 Kazanan: ${m.winner}</div>
      ${table(m)}
    `;
  }catch(e){
    box.className = "preview-box";
    box.innerHTML = `<div class="preview-error">❌ ${e.message}</div>`;
  }
}

function render(){
  renderDashboard();
  renderStandings();
  renderHistory();
  renderPlayers();
  renderTrophies();
  renderRecords();
  renderBadges();
  $("sidebarScore").innerHTML = sidebarSummary();
}




function renderStandings(){
  const seasons = buildSeasons();
  const activeSeason = seasons[seasons.length - 1];

  if(selectedSeasonNumber === null) selectedSeasonNumber = activeSeason.number;
  if(!seasons.some(s => s.number === selectedSeasonNumber)) selectedSeasonNumber = activeSeason.number;

  const selected = seasons.find(s => s.number === selectedSeasonNumber) || activeSeason;
  const rows = standingsRows(selected.matches);

  $("seasonSelectBtn").textContent = `🏆 ${selected.number}. Sezon ▼`;
  $("selectedSeasonTitle").textContent = `${selected.number}. Sezon Lig Tablosu`;
  $("selectedSeasonInfo").textContent = selected.completed
    ? `Tamamlandı • Şampiyon: ${selected.champion}`
    : selected.matches.length ? `Devam ediyor • ${selected.matches.length} maç` : `Henüz başlamadı`;

  renderSeasonMenu(seasons, activeSeason.number);
  $("standingsTable").innerHTML = selected.matches.length ? standingsTable(rows) : emptySeasonTable();
  renderSelectedSeasonCards(selected, rows);
  renderSelectedSeasonMatches(selected);
}

function renderSeasonMenu(seasons, activeNumber){
  const maxSeason = Math.max(activeNumber + 1, 3);
  const items = [];
  for(let i=1;i<=maxSeason;i++){
    const season = seasons.find(s => s.number === i) || makeSeason(i);
    items.push(season);
  }

  $("seasonMenu").innerHTML = items.map(season => `
    <button class="${season.number === selectedSeasonNumber ? "active" : ""}" data-season="${season.number}">
      🏆 ${season.number}. Sezon
      <small>${season.completed ? `Tamamlandı • Şampiyon: ${season.champion}` : season.number === activeNumber ? "Aktif sezon" : "Henüz başlamadı"}</small>
    </button>
  `).join("");

  $("seasonSelectBtn").onclick = (e) => {
    e.stopPropagation();
    $("seasonMenu").classList.toggle("open");
  };

  document.querySelectorAll("#seasonMenu button").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      selectedSeasonNumber = Number(btn.dataset.season);
      $("seasonMenu").classList.remove("open");
      renderStandings();
    };
  });

  document.addEventListener("click", () => $("seasonMenu")?.classList.remove("open"), {once:true});
}

function renderSelectedSeasonCards(season, rows){
  if(!season.matches.length){
    $("standingsCards").innerHTML = [
      record("🏆","Sezon Durumu",`${season.number}. sezon henüz başlamadı`),
      record("⚽","Atılan Gol","0"),
      record("📈","Averaj","0"),
      record("🛡️","Yenilen Gol","0")
    ].join("");
    return;
  }

  const leader = rows[0];
  const mostGoals = [...rows].sort((a,b)=>b.goalsFor-a.goalsFor)[0];
  const bestAvg = [...rows].sort((a,b)=>b.goalDiff-a.goalDiff)[0];
  const bestDefense = [...rows].sort((a,b)=>a.goalsAgainst-b.goalsAgainst)[0];

  $("standingsCards").innerHTML = [
    record(season.completed ? "🏆" : "👑", season.completed ? "Sezon Şampiyonu" : "Aktif Lider",`${playerDot(leader.player)} ${leader.player} • ${leader.points} puan`),
    record("⚽","Sezonun En Fazla Golü",`${playerDot(mostGoals.player)} ${mostGoals.player} • ${mostGoals.goalsFor} gol`),
    record("📈","Sezonun En İyi Averajı",`${playerDot(bestAvg.player)} ${bestAvg.player} • ${formatAvg(bestAvg.goalDiff)}`),
    record("🛡️","Sezonun En Az Yenilen Golü",`${playerDot(bestDefense.player)} ${bestDefense.player} • ${bestDefense.goalsAgainst} gol`)
  ].join("");
}

function renderSelectedSeasonMatches(season){
  $("selectedSeasonMatches").innerHTML = season.matches.length
    ? season.matches.slice().reverse().map(m => `<div class="season-match"><b>${scoreLine(m)}</b><span>${m.date}</span></div>`).join("")
    : `<div class="empty-season"><strong>0 Maç</strong>${season.number}. sezon henüz başlamadı.</div>`;
}

function buildSeasons(){
  const chronological = [...matches].reverse();
  const seasons = [];
  let current = makeSeason(1);

  chronological.forEach(match => {
    current.matches.push(match);
    const rows = standingsRows(current.matches);
    const champ = rows.find(r => r.points >= SEASON_TARGET);

    if(champ){
      current.completed = true;
      current.champion = champ.player;
      current.completedAt = match.date;
      seasons.push(current);
      current = makeSeason(current.number + 1);
    }
  });

  seasons.push(current);
  return seasons;
}

function makeSeason(number){
  return {number, matches: [], completed: false, champion: null, completedAt: null};
}

function standingsTable(rows){
  return `
    <table class="standings-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Oyuncu</th>
          <th>P</th>
          <th>O</th>
          <th>G</th>
          <th>M</th>
          <th>AG</th>
          <th>YG</th>
          <th>AV</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r,i)=>`
          <tr>
            <td class="rank">${i===0 ? "🥇" : "🥈"}</td>
            <td class="player-cell">${playerDot(r.player)} ${r.player}</td>
            <td class="points">${r.points}</td>
            <td>${r.played}</td>
            <td>${r.wins}</td>
            <td>${r.losses}</td>
            <td>${r.goalsFor}</td>
            <td>${r.goalsAgainst}</td>
            <td class="${r.goalDiff>0?"positive":r.goalDiff<0?"negative":"zero"}">${formatAvg(r.goalDiff)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function emptySeasonTable(){
  return `
    <div class="empty-season">
      <strong>0 Puan</strong>
      Bu sezon henüz başlamadı. Maç oynanınca tablo otomatik dolacak.
    </div>
    ${standingsTable(standingsRows([]))}
  `;
}

function standingsRows(seasonMatches = matches){
  return PLAYERS.map(player => {
    const opponent = PLAYERS.find(p => p !== player);
    const played = seasonMatches.length;
    const wins = seasonMatches.filter(m => m.winner === player).length;
    const losses = played - wins;
    const goalsFor = seasonMatches.reduce((s,m)=>s+(m.score[player]||0),0);
    const goalsAgainst = seasonMatches.reduce((s,m)=>s+(m.score[opponent]||0),0);
    const goalDiff = goalsFor - goalsAgainst;
    const points = wins * 3;
    return {player, played, wins, losses, points, goalsFor, goalsAgainst, goalDiff};
  }).sort((a,b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor);
}

function playerDot(player){
  return player === "Serkan" ? "🟡" : "🔴";
}

function formatAvg(n){
  return n > 0 ? `+${n}` : String(n);
}

function renderTrophies(){
  const seasons = buildSeasons().filter(s => s.completed);
  $("trophyCabinet").innerHTML = PLAYERS.map(player => {
    const wins = seasons.filter(s => s.champion === player).slice(0,3);
    const cups = [0,1,2].map(i => {
      const season = wins[i];
      return `
        <div class="trophy ${season ? "active" : ""}">
          <div class="trophy-label">${season ? `${season.number}. Sezon` : "Kilitli"}</div>
          <div>
            <div class="trophy-cup">🏆</div>
            <small>${season ? "Şampiyonluk Kupası" : "Şampiyonluk bekliyor"}</small>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="trophy-player ${player.toLowerCase()}">
        <div class="trophy-player-head">
          <div>
            <span class="kicker">Kupa Dolabı</span>
            <h3>${player}</h3>
          </div>
          <div class="live-pill">${wins.length} / 3 Kupa</div>
        </div>
        <div class="trophy-shelf">${cups}</div>
      </div>
    `;
  }).join("");
}


function renderDashboard(){
  const st = state(matches);
  $("livePill").textContent = `${matches.length} maç`;
  $("serkanWinsHero").textContent = st.Serkan.wins;
  $("ramazanWinsHero").textContent = st.Ramazan.wins;
  $("totalScoreHero").textContent = `${st.Serkan.goals} - ${st.Ramazan.goals}`;

  $("dashboardCards").innerHTML = [
    card("Toplam Maç", matches.length),
    card("Toplam Gol", st.Serkan.goals + st.Ramazan.goals),
    card("Serkan Gol", st.Serkan.goals),
    card("Ramazan Gol", st.Ramazan.goals),
    card("Serkan Galibiyet %", pct(st.Serkan.wins,matches.length)),
    card("Ramazan Galibiyet %", pct(st.Ramazan.wins,matches.length)),
    card("Serkan Ort. xG", avgStat("Serkan","Gol beklentisi (xG)")),
    card("Ramazan Ort. xG", avgStat("Ramazan","Gol beklentisi (xG)")),
    card("Serkan Ort. Şut", avgStat("Serkan","Şut")),
    card("Ramazan Ort. Şut", avgStat("Ramazan","Şut")),
    card("Serkan Ort. Pas", avgStat("Serkan","Pas")),
    card("Ramazan Ort. Pas", avgStat("Ramazan","Pas"))
  ].join("");

  $("formBox").innerHTML = PLAYERS.map(p => `<div class="form-row"><h4>${p}</h4><div class="dots">${matches.slice(0,10).map(m => `<div class="dot ${m.winner===p?"win":"loss"}">${m.winner===p?"G":"M"}</div>`).join("") || `<p class="muted">Henüz maç yok.</p>`}</div></div>`).join("");
  renderGoalChart();
  $("recentCount").textContent = `${matches.length} kayıt`;
  $("recentMatches").innerHTML = matches.slice(0,4).map(matchCard).join("") || empty("Henüz maç eklenmedi.");
  bindCards();
}

function renderGoalChart(){
  const last = [...matches].reverse().slice(-12);
  const max = Math.max(1,...last.flatMap(m => PLAYERS.map(p => m.score[p]||0)));
  $("goalChart").innerHTML = last.map(m => `<div class="bar-pair" title="${scoreLine(m)}">
    <div class="bar s" style="height:${Math.max(5,(m.score.Serkan||0)/max*100)}%"></div>
    <div class="bar r" style="height:${Math.max(5,(m.score.Ramazan||0)/max*100)}%"></div>
  </div>`).join("") || `<p class="muted">Grafik için maç ekle.</p>`;
}

function renderHistory(){
  const q = norm($("search")?.value || "");
  const f = $("winnerFilter")?.value || "all";
  const sort = $("sortMode")?.value || "new";

  let data = matches
    .filter(m => f==="all" || m.winner===f)
    .filter(m => searchableMatchText(m).includes(q));

  if(sort==="old") data = [...data].reverse();
  if(sort==="goals") data = [...data].sort((a,b)=>totalGoals(b)-totalGoals(a));
  if(sort==="diff") data = [...data].sort((a,b)=>diff(b)-diff(a));
  if(sort==="xg") data = [...data].sort((a,b)=>matchStatTotal(b,"Gol beklentisi (xG)")-matchStatTotal(a,"Gol beklentisi (xG)"));
  if(sort==="shots") data = [...data].sort((a,b)=>matchStatTotal(b,"Şut")-matchStatTotal(a,"Şut"));

  $("historyList").innerHTML = data.map(matchCard).join("") || empty("Sonuç bulunamadı.");
  bindCards();
}

function renderPlayers(){
  $("playersGrid").innerHTML = PLAYERS.map(p => {
    const ps = computePlayer(matches,p);
    return `<div class="player-card ${p.toLowerCase()}">
      <div class="player-head"><div><span class="kicker">Profil</span><h3>${p}</h3></div><div class="avatar">${p[0]}</div></div>
      <div class="mini-grid">
        ${mini("Maç", ps.played)}${mini("Galibiyet", ps.wins)}${mini("Mağlubiyet", ps.losses)}${mini("Gol", ps.goals)}
        ${mini("Yenilen", ps.conceded)}${mini("Ort. Gol", ps.avgGoals)}${mini("Ort. Şut", ps.avgShots)}${mini("Ort. xG", ps.avgXg)}
        ${mini("Ort. Pas", avgStat(p,"Pas"))}${mini("Ort. Top", avgStat(p,"Topa sahip olma")+"%")}
        ${mini("En İyi Seri", bestStreak(matches,p))}${mini("Galibiyet %", pct(ps.wins, ps.played))}
      </div>
    </div>`;
  }).join("");
}

function renderRecords(){
  $("recordsGrid").innerHTML = [
    record("🏆","En Farklı Galibiyet", biggestWin(matches)),
    record("⚽","En Çok Gol Atılan Maç", mostGoalsMatch(matches)),
    record("🎯","En Çok Şut", recordByStat(matches,"Şut")),
    record("📈","En Yüksek xG", recordByStat(matches,"Gol beklentisi (xG)")),
    record("👟","En Çok Pas", recordByStat(matches,"Pas")),
    record("🧱","En Çok Kurtarış", recordByStat(matches,"Kurtarış")),
    record("🦶","En Çok Müdahale", recordByStat(matches,"Müdahale")),
    record("✂️","En Çok Top Kesme", recordByStat(matches,"Top kesme")),
    record("🟨","En Çok Sarı Kart", recordByStat(matches,"Sarı kart")),
    record("🔥","Serkan En İyi Seri", bestStreak(matches,"Serkan")+" maç"),
    record("🔥","Ramazan En İyi Seri", bestStreak(matches,"Ramazan")+" maç"),
    record("📊","En Yüksek Topa Sahip Olma", recordByStat(matches,"Topa sahip olma"))
  ].join("");
}

function renderBadges(){
  const badges = [];
  [10,20,30,40,50].forEach(n => PLAYERS.forEach(p => badges.push([`${p} ${n}. Galibiyet`, computePlayer(matches,p).wins >= n, achievedDate(p,"wins",n)])));
  [100,200,300,400,500].forEach(n => PLAYERS.forEach(p => badges.push([`${p} ${n} Gol`, computePlayer(matches,p).goals >= n, achievedDate(p,"goals",n)])));
  [5,10,15].forEach(n => PLAYERS.forEach(p => badges.push([`${p} ${n} Maç Seri`, bestStreak(matches,p) >= n, achievedDate(p,"streak",n)])));

  $("badgesGrid").innerHTML = badges.map(([t,u,d]) => `<div class="badge-card ${u?"unlocked":"locked"}"><div class="icon">${u?"🏅":"🔒"}</div><h3>${t}</h3><p>${u ? "Açıldı" + (d ? " • " + d : "") : "Kilitli"}</p></div>`).join("");
}

function matchCard(m){
  return `<div class="match-card" data-id="${m.id}">
    <div class="match-top">
      <div>
        <div class="score-title">${scoreLine(m)} ${m.supabaseSynced ? `<span class="supabase-online">Live</span>` : m.supabaseError ? `<span class="supabase-offline">Live hata</span>` : ``} ${m.sheetSynced ? `<span class="sync-badge">Sheet</span>` : m.sheetError ? `<span class="sync-badge fail">Sheet hata</span>` : ``}</div>
        <span class="winner">🏆 Kazanan: ${m.winner}</span>
      </div>
      <div class="date">${m.date}</div>
    </div>
    <div class="detail">
      ${table(m)}
      <div class="card-actions">
        ${isAdmin ? `<button class="secondary edit-btn" data-id="${m.id}">Düzenle</button><button class="mini-danger delete-btn" data-id="${m.id}">Sil</button>` : ``}
      </div>
    </div>
  </div>`;
}

function table(m){
  const [p1,p2] = m.players;
  const keys = ORDER.filter(k => m.stats[k]).concat(Object.keys(m.stats).filter(k => !ORDER.includes(k)));
  return `<table class="stat-table"><thead><tr><th>İstatistik</th><th>${p1}</th><th>${p2}</th></tr></thead><tbody>${keys.map(k=>`<tr><td>${k}</td><td>${m.stats[k][p1]}</td><td>${m.stats[k][p2]}</td></tr>`).join("")}</tbody></table>`;
}

function bindCards(){
  document.querySelectorAll(".match-card").forEach(c => {
    c.onclick = (e) => {
      if(e.target.closest("button")) return;
      c.querySelector(".detail").classList.toggle("open");
    };
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if(!isAdmin){ alert("Bu işlem sadece admin için açık."); return; }

      const id = btn.dataset.id;
      if(confirm("Bu maç silinsin mi?")){
        matches = matches.filter(m => m.id !== id);
        await deleteMatchesFromSupabase([id]);
        saveMatches();
        render();
        toast("Maç silindi ve canlı siteden kaldırıldı.");
      }
    };
  });

  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const m = matches.find(x => x.id === btn.dataset.id);
      if(!m) return;
      editId = m.id;
      $("matchInput").value = m.raw;
      $("saveBtn").textContent = "Maçı Güncelle";
      $("message").textContent = "Düzenleme modundasın: " + scoreLine(m);
      $("message").style.color = "#fde68a";
      renderPreview();
      switchPage("add");
    };
  });
}

function state(data){
  const obj = {};
  PLAYERS.forEach(p => obj[p] = computePlayer(data,p));
  return obj;
}

function computePlayer(data, player){
  const opponent = PLAYERS.find(p => p !== player);
  const played = data.length;
  const wins = data.filter(m => m.winner === player).length;
  const losses = played - wins;
  const goals = data.reduce((s,m)=>s+(m.score[player]||0),0);
  const conceded = data.reduce((s,m)=>s+(m.score[opponent]||0),0);
  return {
    played,wins,losses,goals,conceded,
    avgGoals: played ? (goals/played).toFixed(1) : "0",
    avgShots: avg(data,player,"Şut"),
    avgXg: avg(data,player,"Gol beklentisi (xG)")
  };
}

function recordByStat(data, stat){
  let best = null;
  data.forEach(m => m.players.forEach(p => {
    const v = toNumber(m.stats[stat]?.[p]);
    if(!best || v > best.value) best = {player:p,value:v,match:m};
  }));
  return best ? `${best.player}: ${best.value} (${scoreLine(best.match)})` : null;
}

function biggestWin(data){
  if(!data.length) return null;
  const m = [...data].sort((a,b)=>diff(b)-diff(a))[0];
  return `${m.winner}: ${scoreLine(m)}`;
}

function mostGoalsMatch(data){
  if(!data.length) return null;
  const m = [...data].sort((a,b)=>totalGoals(b)-totalGoals(a))[0];
  return scoreLine(m);
}

function bestStreak(data, player){
  let best=0, cur=0;
  [...data].reverse().forEach(m => {
    if(m.winner === player){ cur++; best=Math.max(best,cur); }
    else cur=0;
  });
  return best;
}

function achievedDate(player,type,target){
  let wins=0, goals=0, streak=0;
  for(const m of [...matches].reverse()){
    if(type === "wins" && m.winner === player) wins++;
    if(type === "goals") goals += m.score[player] || 0;
    if(type === "streak") streak = m.winner === player ? streak + 1 : 0;
    if((type==="wins" && wins>=target) || (type==="goals" && goals>=target) || (type==="streak" && streak>=target)) return m.date;
  }
  return "";
}

function scoreLine(m){
  const [p1,p2]=m.players;
  return `${p1} ${m.score[p1]||0} - ${m.score[p2]||0} ${p2}`;
}
function card(l,v){ return `<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`; }
function mini(l,v){ return `<div class="mini"><span>${l}</span><strong>${v}</strong></div>`; }
function record(i,t,v){ return `<div class="record-card"><div class="icon">${i}</div><h3>${t}</h3><p>${v || "Henüz yok"}</p></div>`; }
function empty(t){ return `<div class="panel"><p class="muted">${t}</p></div>`; }
function pct(a,b){ return b ? Math.round(a/b*100)+"%" : "0%"; }
function totalGoals(m){ return (m.score.Serkan||0)+(m.score.Ramazan||0); }
function diff(m){ return Math.abs((m.score.Serkan||0)-(m.score.Ramazan||0)); }
function matchStatTotal(m, stat){ return PLAYERS.reduce((s,p)=>s+toNumber(m.stats[stat]?.[p]),0); }
function avg(data,p,stat){
  const vals = data.map(m => toNumber(m.stats[stat]?.[p])).filter(v=>Number.isFinite(v));
  return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : "0";
}
function avgStat(p,k){ return avg(matches,p,k); }
function toNumber(v){
  const n = parseFloat(String(v ?? "").replace(",",".").replace(/[^\d.-]/g,""));
  return Number.isFinite(n)?n:0;
}
function norm(s){ return String(s).toLocaleLowerCase("tr-TR"); }
function searchableMatchText(m){
  const line = scoreLine(m);
  return norm(line + " " + line.replace(/\s+/g,"") + " " + m.date);
}

function sidebarSummary(){
  const st=state(matches);
  return `<b>Toplam:</b> ${matches.length} maç<br><b>Skor:</b> ${st.Serkan.goals} - ${st.Ramazan.goals}<br><b>Galibiyet:</b> ${st.Serkan.wins} - ${st.Ramazan.wins}`;
}
function toast(text){
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),1800);
}
function openModal(title, body){
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  $("resetModal").classList.add("open");
}
function closeModal(){
  $("resetModal").classList.remove("open");
}

async function deleteMatchesFromSupabase(ids){
  if(!isAdmin) return;
  if(!supabaseClient) initSupabaseClient();
  if(!supabaseClient || !ids?.length) return;
  try{
    await supabaseClient.from("matches").delete().in("id", ids);
  }catch(e){
    console.warn("Supabase silme hatası:", e);
  }
}

function openSeasonReset(){
  if(!isAdmin){ alert("Bu işlem sadece admin için açık."); return; }
  const seasons = buildSeasons();
  openModal("Sezon Sıfırlama", `
    <p class="muted">Hangi sezonu sıfırlamak istiyorsun?</p>
    <div class="reset-grid">
      ${seasons.map(s => `<button class="reset-option season-reset-choice" data-season="${s.number}">🏆 ${s.number}. Sezon <small>${s.matches.length} maç</small></button>`).join("")}
    </div>
  `);
  document.querySelectorAll(".season-reset-choice").forEach(btn => {
    btn.onclick = () => {
      const seasonNo = Number(btn.dataset.season);
      if(confirm(`${seasonNo}. sezonun tüm maçları silinsin mi? Bu işlem geri alınamaz.`)){
        const target = buildSeasons().find(s => s.number === seasonNo);
        const ids = new Set((target?.matches || []).map(m => m.id));
        matches = matches.filter(m => !ids.has(m.id));
        deleteMatchesFromSupabase([...ids]);
        saveMatches();
        selectedSeasonNumber = null;
        closeModal();
        render();
        toast(`${seasonNo}. sezon sıfırlandı.`);
      }
    };
  });
}
function openMatchReset(){
  if(!isAdmin){ alert("Bu işlem sadece admin için açık."); return; }
  const recent = matches.slice(0,20);
  openModal("Maç Sıfırlama", `
    <p class="muted">Silmek istediğin son maçları seç.</p>
    <div class="check-list">
      ${recent.map(m => `<label class="check-item"><input type="checkbox" value="${m.id}"><span><b>${scoreLine(m)}</b><br>${m.date}</span></label>`).join("") || `<p class="muted">Silinecek maç yok.</p>`}
    </div>
    <button class="danger" id="deleteSelectedMatches">Seçilen Maçları Sil</button>
  `);
  const del = $("deleteSelectedMatches");
  if(del){
    del.onclick = () => {
      const ids = [...document.querySelectorAll(".check-item input:checked")].map(x => x.value);
      if(!ids.length){ alert("Önce maç seç."); return; }
      if(confirm(`${ids.length} maç silinsin mi? Bu işlem geri alınamaz.`)){
        const set = new Set(ids);
        matches = matches.filter(m => !set.has(m.id));
        deleteMatchesFromSupabase(ids);
        saveMatches();
        selectedSeasonNumber = null;
        closeModal();
        render();
        toast(`${ids.length} maç silindi.`);
      }
    };
  }
}




async function initAuthState(){
  if(!supabaseClient){
    applyViewerMode();
    return;
  }

  try{
    const { data } = await supabaseClient.auth.getUser();
    currentUserEmail = data?.user?.email || null;
    isAdmin = currentUserEmail === ADMIN_EMAIL;
    currentUserName = isAdmin ? "Serkan" : "İzleyici";
    applyViewerMode();

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentUserEmail = session?.user?.email || null;
      isAdmin = currentUserEmail === ADMIN_EMAIL;
      currentUserName = isAdmin ? "Serkan" : "İzleyici";
      applyViewerMode();
      subscribePresence();
    });
  }catch(e){
    isAdmin = false;
    currentUserEmail = null;
    applyViewerMode();
  }
}

function applyViewerMode(){
  document.body.classList.toggle("viewer-mode", !isAdmin);

  const status = $("adminStatus");
  const loginBtn = $("adminLoginBtn");
  const logoutBtn = $("adminLogoutBtn");
  const emailInput = $("adminEmailInput");

  if(status){
    status.textContent = isAdmin ? `✅ Admin: ${currentUserEmail}` : "👀 İzleyici modu";
    status.classList.toggle("admin", isAdmin);
  }
  if(loginBtn) loginBtn.style.display = isAdmin ? "none" : "block";
  if(logoutBtn) logoutBtn.style.display = isAdmin ? "block" : "none";
  if(emailInput) emailInput.style.display = isAdmin ? "none" : "block";

  const active = document.querySelector(".nav-btn.active");
  if(!isAdmin && active?.dataset.page === "add"){
    switchPage("dashboard");
  }
}

async function adminLogin(){
  if(!supabaseClient) initSupabaseClient();
  if(!supabaseClient) return alert("Supabase bağlantısı yok.");

  const email = ($("adminEmailInput")?.value || "").trim().toLowerCase();
  if(email !== ADMIN_EMAIL){
    alert("Bu e-posta admin olarak tanımlı değil.");
    return;
  }

  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options:{ emailRedirectTo: redirectTo }
  });

  if(error){
    alert("Giriş linki gönderilemedi: " + error.message);
    return;
  }

  alert("Admin giriş linki e-postana gönderildi. Maildeki linke tıkla, siteye admin olarak döneceksin.");
}

async function adminLogout(){
  if(supabaseClient) await supabaseClient.auth.signOut();
  isAdmin = false;
  currentUserEmail = null;
  currentUserName = "İzleyici";
  applyViewerMode();
  alert("Çıkış yapıldı. Site izleyici modunda.");
}

function initSupabaseClient(){
  const staticUrl = window.EAFC26_SUPABASE?.url || "";
  const staticKey = window.EAFC26_SUPABASE?.anonKey || "";

  const url = staticUrl || localStorage.getItem(SUPABASE_URL_KEY) || "";
  const key = staticKey || localStorage.getItem(SUPABASE_ANON_KEY) || "";

  if(staticUrl && $("supabaseUrlInput")) $("supabaseUrlInput").value = staticUrl;
  if(staticKey && $("supabaseAnonInput")) $("supabaseAnonInput").value = staticKey;

  if(!url || !key || !window.supabase){
    supabaseClient = null;
    updateSyncWidget("offline", "☁ Supabase bilgisi yok");
    return null;
  }

  supabaseClient = window.supabase.createClient(url, key);
  updateSyncWidget("pending", "☁ Canlı bağlantı hazırlanıyor");
  return supabaseClient;
}

function saveSupabaseConfig(){
  const url = $("supabaseUrlInput").value.trim();
  const key = $("supabaseAnonInput").value.trim();

  if(!url || !key){
    localStorage.removeItem(SUPABASE_URL_KEY);
    localStorage.removeItem(SUPABASE_ANON_KEY);
    supabaseClient = null;
    setSupabaseStatus("Supabase bilgileri kaldırıldı.", false);
    return;
  }

  if(!url.startsWith("https://") || !url.includes(".supabase.co")){
    setSupabaseStatus("Project URL hatalı görünüyor. https://xxxxx.supabase.co şeklinde olmalı.", false);
    return;
  }

  localStorage.setItem(SUPABASE_URL_KEY, url);
  localStorage.setItem(SUPABASE_ANON_KEY, key);
  initSupabaseClient();
  autoLoadSupabaseIfConfigured();
  setSupabaseStatus("Supabase bilgileri kaydedildi.", true);
}

async function testSupabaseConnection(){
  if(!supabaseClient) initSupabaseClient();
  if(!supabaseClient) return setSupabaseStatus("Önce Supabase URL ve anon key girip kaydet.", false);

  try{
    const { error } = await supabaseClient
      .from("matches")
      .select("id")
      .limit(1);

    if(error) throw error;
    setSupabaseStatus("Supabase bağlantısı tamam.", true);
  }catch(e){
    setSupabaseStatus("Supabase bağlantı hatası: " + e.message, false);
  }
}

async function autoLoadSupabaseIfConfigured(){
  if(!supabaseClient) return;
  try{
    const remote = await fetchSupabaseMatches();
    if(remote.length >= matches.length){
      matches = remote;
      saveMatches();
    }
    updateSyncWidget("online", "☁ Canlı bağlantı aktif");
    subscribeRealtimeMatches();
    subscribePresence();
    await flushOfflineQueue();
  }catch(e){
    updateSyncWidget("offline", "☁ Çevrimdışı / Supabase hatası");
    console.warn("Supabase otomatik yükleme başarısız:", e);
  }
}

async function fetchSupabaseMatches(){
  if(!supabaseClient) initSupabaseClient();
  if(!supabaseClient) return [];

  const { data, error } = await supabaseClient
    .from("matches")
    .select("*")
    .order("created_at_ms", { ascending:false });

  if(error) throw error;

  return (data || []).map(rowToMatch);
}

async function loadMatchesFromSupabase(){
  try{
    const remote = await fetchSupabaseMatches();
    matches = remote;
    saveMatches();
    render();
    setSupabaseStatus(`${remote.length} maç Supabase'den yüklendi.`, true);
  }catch(e){
    setSupabaseStatus("Supabase yükleme hatası: " + e.message, false);
  }
}

async function syncMatchToSupabase(match){
  if(!isAdmin) return "none";
  if(!supabaseClient) initSupabaseClient();

  if(!navigator.onLine || !supabaseClient){
    queueOfflineMatch(match);
    match.supabaseSynced = false;
    match.supabaseError = true;
    saveMatches();
    updateSyncWidget("pending", "☁ İnternet yok, sıraya alındı");
    return "queued";
  }

  try{
    updateSyncWidget("pending", "☁ Maç gönderiliyor...");
    const { error } = await supabaseClient
      .from("matches")
      .upsert(matchToSupabaseRow(match), { onConflict:"id" });

    if(error) throw error;

    match.supabaseSynced = true;
    match.supabaseError = false;
    saveMatches();
    updateSyncWidget("online", "☁ Son senkronizasyon şimdi");
    return "synced";
  }catch(e){
    queueOfflineMatch(match);
    match.supabaseSynced = false;
    match.supabaseError = true;
    saveMatches();
    updateSyncWidget("pending", "☁ Gönderilemedi, sıraya alındı");
    return "queued";
  }
}

async function syncAllMatchesToSupabase(){
  if(!isAdmin) return setSupabaseStatus("Bu işlem sadece admin için açık.", false);
  if(!supabaseClient) initSupabaseClient();
  if(!supabaseClient) return setSupabaseStatus("Önce Supabase URL ve anon key girip kaydet.", false);
  if(!matches.length) return setSupabaseStatus("Aktarılacak maç yok.", false);

  if(!confirm(`${matches.length} maç Supabase'e aktarılacak. Devam edilsin mi?`)) return;

  try{
    const rows = matches.map(matchToSupabaseRow);
    const { error } = await supabaseClient
      .from("matches")
      .upsert(rows, { onConflict:"id" });

    if(error) throw error;

    matches = matches.map(m => ({...m, supabaseSynced:true, supabaseError:false}));
    saveMatches();
    render();
    setSupabaseStatus(`${matches.length} maç Supabase'e aktarıldı.`, true);
  }catch(e){
    setSupabaseStatus("Supabase aktarım hatası: " + e.message, false);
  }
}

function matchToSupabaseRow(m){
  return {
    id: m.id,
    created_at_ms: m.createdAt || Date.now(),
    match_date_text: m.date || "",
    players: m.players || ["Serkan","Ramazan"],
    score: m.score || {},
    winner: m.winner || "",
    stats: m.stats || {},
    raw_text: m.raw || ""
  };
}

function rowToMatch(row){
  return {
    id: row.id,
    createdAt: row.created_at_ms || Date.now(),
    date: row.match_date_text || "",
    players: row.players || ["Serkan","Ramazan"],
    score: row.score || {},
    winner: row.winner || "",
    stats: row.stats || {},
    raw: row.raw_text || "",
    supabaseSynced: true,
    supabaseError: false
  };
}

function setSupabaseStatus(text, ok){
  const el = $("supabaseStatus");
  el.textContent = text;
  el.style.color = ok ? "#86efac" : "#fca5a5";
}


function subscribeRealtimeMatches(){
  if(!supabaseClient) return;
  if(realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

  realtimeChannel = supabaseClient
    .channel("eafc26-matches-live")
    .on("postgres_changes", { event:"*", schema:"public", table:"matches" }, async (payload) => {
      try{
        const remote = await fetchSupabaseMatches();
        const oldCount = matches.length;
        matches = remote;
        saveMatches();
        render();

        if(payload.eventType === "INSERT" && remote.length >= oldCount){
          const m = rowToMatch(payload.new);
          showLiveNote("🔔 Yeni maç eklendi", scoreLine(m));
        }

        if(payload.eventType === "UPDATE"){
          showLiveNote("🔄 Maç güncellendi", "Veriler canlı yenilendi.");
        }

        if(payload.eventType === "DELETE"){
          showLiveNote("🗑️ Maç silindi", "Veriler canlı yenilendi.");
        }

        updateSyncWidget("online", "☁ Canlı güncellendi");
      }catch(e){
        console.warn("Realtime yenileme hatası:", e);
      }
    })
    .subscribe((status) => {
      if(status === "SUBSCRIBED") updateSyncWidget("online", "☁ Realtime aktif");
      if(status === "CHANNEL_ERROR") updateSyncWidget("offline", "☁ Realtime hatası");
    });
}

function subscribePresence(){
  if(!supabaseClient) return;
  if(presenceChannel) supabaseClient.removeChannel(presenceChannel);

  presenceChannel = supabaseClient.channel("eafc26-presence", {
    config:{ presence:{ key: currentUserName + "-" + Math.random().toString(36).slice(2) } }
  });

  presenceChannel
    .on("presence", { event:"sync" }, () => {
      const state = presenceChannel.presenceState();
      renderLiveUsers(state);
    })
    .subscribe(async (status) => {
      if(status === "SUBSCRIBED"){
        await presenceChannel.track({
          name: currentUserName,
          online_at: new Date().toISOString()
        });
      }
    });
}

function renderLiveUsers(state){
  const users = Object.values(state).flat().map(x => x.name).filter(Boolean);
  const unique = [...new Set(users)];
  const box = $("liveUsers");
  if(!box) return;
  box.innerHTML = unique.map(name => `<div class="live-user"><span></span>${name} çevrimiçi</div>`).join("");
}

function updateSyncWidget(mode, text){
  const el = $("syncWidget");
  if(!el) return;
  el.className = `sync-widget ${mode || ""}`;
  el.textContent = text;
}

function showLiveNote(title, text){
  let note = document.querySelector(".live-note");
  if(!note){
    note = document.createElement("div");
    note.className = "live-note";
    document.body.appendChild(note);
  }
  note.innerHTML = `<b>${title}</b><span>${text}</span>`;
  note.classList.add("show");
  setTimeout(() => note.classList.remove("show"), 3200);
}

function queueOfflineMatch(match){
  const q = loadOfflineQueue();
  const row = matchToSupabaseRow(match);
  const next = q.filter(x => x.id !== row.id);
  next.push(row);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
}

function loadOfflineQueue(){
  try{ return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)) || []; }
  catch{ return []; }
}

async function flushOfflineQueue(){
  if(!supabaseClient || !navigator.onLine) return;
  const q = loadOfflineQueue();
  if(!q.length) return;

  try{
    updateSyncWidget("pending", `☁ ${q.length} bekleyen maç gönderiliyor...`);
    const { error } = await supabaseClient
      .from("matches")
      .upsert(q, { onConflict:"id" });

    if(error) throw error;
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    matches = matches.map(m => ({...m, supabaseSynced:true, supabaseError:false}));
    saveMatches();
    render();
    updateSyncWidget("online", "☁ Bekleyen maçlar gönderildi");
  }catch(e){
    updateSyncWidget("pending", "☁ Bekleyen maçlar duruyor");
  }
}

window.addEventListener("online", () => {
  updateSyncWidget("pending", "☁ İnternet geldi, senkronlanıyor...");
  flushOfflineQueue();
});
window.addEventListener("offline", () => {
  updateSyncWidget("offline", "☁ Çevrimdışı");
});

function saveSheetUrl(){
  const url = $("sheetUrlInput").value.trim();
  if(!url){ localStorage.removeItem(SHEET_URL_KEY); setSheetStatus("Sheet URL kaldırıldı.", true); return; }
  if(!url.startsWith("https://script.google.com/macros/")){ setSheetStatus("Bu URL Apps Script Web App URL’si gibi görünmüyor.", false); return; }
  localStorage.setItem(SHEET_URL_KEY, url);
  setSheetStatus("Sheet URL kaydedildi.", true);
}
async function testSheetConnection(){
  const url = getSheetUrl();
  if(!url) return setSheetStatus("Önce Sheet URL girip kaydet.", false);
  try{
    await fetch(url,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"test",sentAt:new Date().toISOString()})});
    setSheetStatus("Test isteği gönderildi. Sheet’te TEST satırı oluştuysa bağlantı tamamdır.", true);
  }catch(e){ setSheetStatus("Test gönderilemedi: "+e.message, false); }
}
async function syncMatchToSheet(match){
  const url = getSheetUrl();
  if(!url) return;
  try{
    await fetch(url,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(buildSheetPayload([match],"append"))});
    match.sheetSynced=true; match.sheetError=false; saveMatches();
  }catch(e){ match.sheetSynced=false; match.sheetError=true; saveMatches(); }
}
async function syncAllMatchesToSheet(){
  const url = getSheetUrl();
  if(!url) return setSheetStatus("Önce Sheet URL girip kaydet.", false);
  if(!matches.length) return setSheetStatus("Aktarılacak maç yok.", false);
  if(!confirm(`${matches.length} maç Google Sheet’e aktarılacak. Devam edilsin mi?`)) return;
  try{
    await fetch(url,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(buildSheetPayload(matches,"replace_all"))});
    matches = matches.map(m => ({...m, sheetSynced:true, sheetError:false}));
    saveMatches(); render(); setSheetStatus(`${matches.length} maç Sheet’e gönderildi.`, true);
  }catch(e){ setSheetStatus("Aktarım hatası: "+e.message, false); }
}
function buildSheetPayload(matchList, action){
  return {action, source:"EAFC26 Ultimate Tracker", exportedAt:new Date().toISOString(), matches:matchList.map(matchToSheetRow)};
}
function matchToSheetRow(m){
  const serkan="Serkan", ramazan="Ramazan";
  const seasonNo = getSeasonNumberForMatch(m.id);
  return {
    id:m.id, tarih:m.date, sezon:seasonNo, kazanan:m.winner, skor:scoreLine(m),
    serkan_gol:m.score[serkan]||0, ramazan_gol:m.score[ramazan]||0,
    serkan_top:m.stats["Topa sahip olma"]?.[serkan]||"", ramazan_top:m.stats["Topa sahip olma"]?.[ramazan]||"",
    serkan_topu_geri_kazanma:m.stats["Topu geri kazanma"]?.[serkan]||"", ramazan_topu_geri_kazanma:m.stats["Topu geri kazanma"]?.[ramazan]||"",
    serkan_sut:m.stats["Şut"]?.[serkan]||"", ramazan_sut:m.stats["Şut"]?.[ramazan]||"",
    serkan_xg:m.stats["Gol beklentisi (xG)"]?.[serkan]||"", ramazan_xg:m.stats["Gol beklentisi (xG)"]?.[ramazan]||"",
    serkan_pas:m.stats["Pas"]?.[serkan]||"", ramazan_pas:m.stats["Pas"]?.[ramazan]||"",
    serkan_mudahale:m.stats["Müdahale"]?.[serkan]||"", ramazan_mudahale:m.stats["Müdahale"]?.[ramazan]||"",
    serkan_top_kazanilan_mudahale:m.stats["Top kazanılan müdahale"]?.[serkan]||"", ramazan_top_kazanilan_mudahale:m.stats["Top kazanılan müdahale"]?.[ramazan]||"",
    serkan_top_kesme:m.stats["Top kesme"]?.[serkan]||"", ramazan_top_kesme:m.stats["Top kesme"]?.[ramazan]||"",
    serkan_kurtaris:m.stats["Kurtarış"]?.[serkan]||"", ramazan_kurtaris:m.stats["Kurtarış"]?.[ramazan]||"",
    serkan_faul:m.stats["Yapılan faul"]?.[serkan]||"", ramazan_faul:m.stats["Yapılan faul"]?.[ramazan]||"",
    serkan_ofsayt:m.stats["Ofsayt"]?.[serkan]||"", ramazan_ofsayt:m.stats["Ofsayt"]?.[ramazan]||"",
    serkan_korner:m.stats["Köşe vuruşu"]?.[serkan]||"", ramazan_korner:m.stats["Köşe vuruşu"]?.[ramazan]||"",
    serkan_serbest_vurus:m.stats["Serbest vuruş"]?.[serkan]||"", ramazan_serbest_vurus:m.stats["Serbest vuruş"]?.[ramazan]||"",
    serkan_penalti:m.stats["Penaltı"]?.[serkan]||"", ramazan_penalti:m.stats["Penaltı"]?.[ramazan]||"",
    serkan_sari_kart:m.stats["Sarı kart"]?.[serkan]||"", ramazan_sari_kart:m.stats["Sarı kart"]?.[ramazan]||""
  };
}
function getSeasonNumberForMatch(matchId){
  const seasons = buildSeasons();
  const found = seasons.find(s => s.matches.some(m => m.id === matchId));
  return found ? found.number : "";
}
function getSheetUrl(){ return localStorage.getItem(SHEET_URL_KEY) || ""; }
function setSheetStatus(text, ok){ const el=$("sheetStatus"); el.textContent=text; el.style.color=ok?"#86efac":"#fca5a5"; }

function exportJson(data){
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "eafc26-ultimate-yedek.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function importBackup(file){
  if(!file) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      matches = JSON.parse(r.result);
      saveMatches();
      render();
      toast("Yedek yüklendi.");
    }catch{
      alert("Yedek dosyası okunamadı.");
    }
  };
  r.readAsText(file);
}
function fillSample(){
  $("matchInput").value = `| İstatistik | Ramazan | Serkan |
| Skor | 4 | 2 |
| Topa sahip olma | %56 | %44 |
| Topu geri kazanma | 5 sn | 8 sn |
| Şut | 13 | 9 |
| Gol beklentisi (xG) | 3.8 | 1.7 |
| Pas | 162 | 128 |
| Müdahale | 18 | 21 |
| Top kazanılan müdahale | 12 | 14 |
| Top kesme | 6 | 8 |
| Kurtarış | 3 | 5 |
| Yapılan faul | 2 | 1 |
| Ofsayt | 1 | 0 |
| Köşe vuruşu | 5 | 3 |
| Serbest vuruş | 1 | 2 |
| Penaltı | 0 | 0 |
| Sarı kart | 1 | 0 |`;
  renderPreview();
}
