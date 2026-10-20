import {initializeApp} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,setPersistence,browserLocalPersistence,signOut,createUserWithEmailAndPassword,sendPasswordResetEmail}
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {getFirestore,arrayUnion,doc,getDocs,writeBatch,where,Timestamp,getDoc,setDoc,updateDoc,deleteDoc,addDoc,collection,query,orderBy,limit,onSnapshot,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {getMessaging,getToken,isSupported}
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
import {getDatabase,ref,onValue,onDisconnect,set,serverTimestamp as rtTime}
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSfbYa7cUIjgF01XcUCnOrY5mmusnRLdE",
  authDomain: "bible-12cc4.firebaseapp.com",
  databaseURL: "https://bible-12cc4-default-rtdb.firebaseio.com",
  projectId: "bible-12cc4",
  storageBucket: "bible-12cc4.firebasestorage.app",
  messagingSenderId: "847997174570",
  appId: "1:847997174570:web:4f45b9936519b540b21453"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});   // logowanie zostaje na stałe
const db = getFirestore(app);
const rtdb = getDatabase(app);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const say = (el, text, cls='') => { el.textContent = text; el.className = 'msg ' + cls; };

let me = null, posts = [], unsubPosts = null, unsubUsers = null;

/* ---------- logowanie ---------- */
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  say($('loginMsg'), 'Logowanie…');
  try { await signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPass').value); }
  catch { say($('loginMsg'), 'Nieprawidłowy e-mail lub hasło.', 'err'); }
});
$('logoutBtn').onclick = async () => { await markOffline(); signOut(auth); };

onAuthStateChanged(auth, async user => {
  stopRealtime();
  if (unsubPosts) { unsubPosts(); unsubPosts = null; }
  if (unsubUsers) { unsubUsers(); unsubUsers = null; }
  if (!user) { me = null; $('app').hidden = true; $('login').hidden = false; return; }
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists() || snap.data().active !== true) {
      await signOut(auth);
      say($('loginMsg'), 'To konto nie ma dostępu. Skontaktuj się z administratorem.', 'err');
      return;
    }
    me = { uid: user.uid, ...snap.data() };
  } catch {
    await signOut(auth);
    say($('loginMsg'), 'Nie udało się sprawdzić konta. Spróbuj ponownie.', 'err');
    return;
  }
  $('login').hidden = true; $('app').hidden = false;
  $('whoName').textContent = me.name || me.email;
  $('adminTabBtn').hidden = $('tab-admin').hidden = $('chatClear').hidden = me.role !== 'admin';
  $('loginPass').value = '';
  say($('loginMsg'), '');
  startPosts(); startPresence(); startChat(); refreshPushToken();
  if (me.role === 'admin') startUsers();
  showTab('browse');
});

/* ---------- zakładki ---------- */
const isDesk = () => matchMedia('(min-width:701px)').matches;
let curTab = 'browse';
function markTab(name) {
  curTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
}
function showTab(name, smooth = false) {
  markTab(name);
  if (isDesk()) window.scrollTo(0, 0);
  else $('pages').scrollTo({ left: $('tab-' + name).offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
}
$('nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab, true); });
let scrollT = null;
$('pages').addEventListener('scroll', () => {
  if (isDesk()) return;
  clearTimeout(scrollT);
  scrollT = setTimeout(() => {
    const tabs = [...document.querySelectorAll('.tab')].filter(t => !t.hidden);
    const i = Math.round($('pages').scrollLeft / ($('pages').clientWidth || 1));
    if (tabs[i]) markTab(tabs[i].id.replace('tab-', ''));
  }, 80);
}, { passive: true });
window.addEventListener('resize', () => { if (!$('app').hidden) showTab(curTab); });

/* ---------- posty: odczyt na żywo ---------- */
function startPosts() {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(500));
  unsubPosts = onSnapshot(q, snap => {
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTagFilter(); renderBrowse(); renderLatest();
  }, err => console.warn(err));
}
const ts = p => p.createdAt?.toMillis?.() ?? Date.now();
const fmt = p => new Date(ts(p)).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });

function cardHTML(p) {
  const canDel = me && (p.authorUid === me.uid || me.role === 'admin');
  let body = '';
  if (p.image) body += `<img class="pic" src="${p.image}" alt="${esc(p.title)}" loading="lazy">`;
  body += '<div class="in">';
  if (p.title) body += `<h3>${esc(p.title)}</h3>`;
  if (p.type === 'quote') {
    body += `<blockquote>${esc(p.body)}</blockquote>` + (p.source ? `<cite>— ${esc(p.source)}</cite>` : '');
  } else if (p.body) body += `<p>${esc(p.body)}</p>`;
  body += `<div class="meta"><span>${esc(p.authorName)}, ${fmt(p)}</span>` +
    (p.tags || []).map(t => `<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('') +
    (canDel ? `<button class="link del" data-del="${p.id}">Usuń</button>` : '') + '</div></div>';
  return `<article class="card">${body}</article>`;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tag]');
  if (t) { $('fTag').value = t.dataset.tag; renderBrowse(); showTab('browse'); return; }
  const d = e.target.closest('[data-del]');
  if (d && confirm('Usunąć ten wpis?')) {
    try { await deleteDoc(doc(db, 'posts', d.dataset.del)); } catch { alert('Nie udało się usunąć wpisu.'); }
  }
});

/* ---------- Najnowsze ---------- */
function renderLatest() {
  const list = posts.slice(0, 20);
  $('feed').innerHTML = list.length ? list.map(cardHTML).join('') : '<div class="empty">Brak wpisów. Dodaj pierwszy w zakładce Utwórz.</div>';
}

/* ---------- Przeglądaj: szukanie, filtry, sortowanie ---------- */
function renderTagFilter() {
  const cur = $('fTag').value;
  const tags = [...new Set(posts.flatMap(p => p.tags || []))].sort((a, b) => a.localeCompare(b, 'pl'));
  $('fTag').innerHTML = '<option value="">Wszystkie tagi</option>' + tags.map(t => `<option value="${esc(t)}">#${esc(t)}</option>`).join('');
  $('fTag').value = tags.includes(cur) ? cur : '';
}
function renderBrowse() {
  const q = $('q').value.trim().toLowerCase(), type = $('fType').value, tag = $('fTag').value, sort = $('fSort').value;
  let list = posts.filter(p =>
    (!type || p.type === type) && (!tag || (p.tags || []).includes(tag)) &&
    (!q || [p.title, p.body, p.source, p.authorName, ...(p.tags || [])].join(' ').toLowerCase().includes(q)));
  const cmp = {
    new: (a, b) => ts(b) - ts(a), old: (a, b) => ts(a) - ts(b),
    title: (a, b) => (a.title || '').localeCompare(b.title || '', 'pl'),
    author: (a, b) => (a.authorName || '').localeCompare(b.authorName || '', 'pl')
  }[sort];
  list.sort(cmp);
  $('count').textContent = `Wyniki: ${list.length}`;
  $('grid').innerHTML = list.length ? list.map(cardHTML).join('') : '<div class="empty">Nic nie znaleziono. Zmień frazę lub filtry.</div>';
}
['q', 'fType', 'fSort', 'fTag'].forEach(id => $(id).addEventListener('input', renderBrowse));

/* ---------- Utwórz ---------- */
let curType = 'text', imageData = null;
const caps = { text: 'Treść', image: 'Podpis (opcjonalnie)', quote: 'Cytat' };
function setType(t) {
  curType = t;
  document.querySelectorAll('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === t));
  $('bodyCap').textContent = caps[t];
  $('imgWrap').hidden = t !== 'image';
  $('srcWrap').hidden = t !== 'quote';
}
$('typeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setType(b.dataset.type); });

function shrink(file, max = 1000, quality = 0.78) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = quality, out = c.toDataURL('image/jpeg', q);
      while (out.length > 900000 && q > 0.3) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      out.length > 950000 ? rej(new Error('big')) : res(out);
    };
    img.onerror = () => rej(new Error('bad'));
    img.src = url;
  });
}
async function takeFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    imageData = await shrink(file);
    $('preview').src = imageData; $('preview').hidden = false;
    $('dropTxt').textContent = 'Zmień obraz';
  } catch { say($('postMsg'), 'Nie udało się wczytać obrazu (za duży lub uszkodzony).', 'err'); }
}
$('pFile').onchange = e => takeFile(e.target.files[0]);
['dragover', 'dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => {
  e.preventDefault(); $('drop').classList.toggle('over', ev === 'dragover');
  if (ev === 'drop') takeFile(e.dataTransfer.files[0]);
}));

$('postForm').addEventListener('submit', async e => {
  e.preventDefault();
  const title = $('pTitle').value.trim(), body = $('pBody').value.trim(), source = $('pSource').value.trim();
  if (curType === 'image' && !imageData) return say($('postMsg'), 'Dodaj obraz.', 'err');
  if (curType !== 'image' && !body) return say($('postMsg'), 'Wpisz treść.', 'err');
  const tags = [...new Set($('pTags').value.split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 10);
  $('postBtn').disabled = true; say($('postMsg'), 'Publikuję…');
  try {
    await addDoc(collection(db, 'posts'), {
      type: curType, title, body, source: curType === 'quote' ? source : '',
      image: curType === 'image' ? imageData : null, tags,
      authorUid: me.uid, authorName: me.name || me.email, createdAt: serverTimestamp()
    });
    $('postForm').reset(); imageData = null; $('preview').hidden = true; $('dropTxt').textContent = 'Wybierz lub upuść obraz';
    setType('text'); say($('postMsg'), '');
    showTab('latest');
  } catch (err) { console.warn(err); say($('postMsg'), 'Nie udało się opublikować. Sprawdź połączenie i reguły bazy.', 'err'); }
  $('postBtn').disabled = false;
});

/* ---------- Administrator: użytkownicy ---------- */
let secAuth = null;
function startUsers() {
  unsubUsers = onSnapshot(collection(db, 'users'), snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pl'));
    $('userList').innerHTML = list.map(u => `
      <div class="user ${u.active ? '' : 'off'}">
        <div class="nm">${esc(u.name)} <span class="pill">${u.role === 'admin' ? 'admin' : 'użytkownik'}</span><small>${esc(u.email)}</small></div>
        ${u.id === me.uid ? '<small>to Ty</small>' : `<div class="acts">
          <button data-act="active" data-id="${u.id}">${u.active ? 'Zablokuj' : 'Odblokuj'}</button>
          <button data-act="role" data-id="${u.id}">${u.role === 'admin' ? 'Odbierz admina' : 'Nadaj admina'}</button>
          <button data-act="reset" data-id="${u.id}" data-email="${esc(u.email)}">Reset hasła</button>
          <button class="red" data-act="del" data-id="${u.id}">Usuń</button></div>`}
      </div>`).join('');
    window._users = Object.fromEntries(list.map(u => [u.id, u]));
  });
}
$('userList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const u = window._users[b.dataset.id], ref = doc(db, 'users', b.dataset.id);
  try {
    if (b.dataset.act === 'active') await updateDoc(ref, { active: !u.active });
    if (b.dataset.act === 'role') await updateDoc(ref, { role: u.role === 'admin' ? 'user' : 'admin' });
    if (b.dataset.act === 'reset') { await sendPasswordResetEmail(auth, b.dataset.email); alert('Wysłano e-mail do resetu hasła.'); }
    if (b.dataset.act === 'del' && confirm(`Usunąć dostęp użytkownika ${u.email}?`)) await deleteDoc(ref);
  } catch (err) { console.warn(err); alert('Operacja nie powiodła się.'); }
});
$('userForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('uName').value.trim(), email = $('uEmail').value.trim(), pass = $('uPass').value, role = $('uRole').value;
  say($('userMsg'), 'Tworzę konto…');
  try {
    // druga instancja aplikacji, żeby utworzenie konta nie wylogowało administratora
    if (!secAuth) secAuth = getAuth(initializeApp(firebaseConfig, 'secondary'));
    const cred = await createUserWithEmailAndPassword(secAuth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), { name, email, role, active: true, createdAt: serverTimestamp() });
    await signOut(secAuth);
    $('userForm').reset(); say($('userMsg'), 'Dodano użytkownika.', 'ok');
  } catch (err) {
    const m = { 'auth/email-already-in-use': 'Ten e-mail ma już konto.', 'auth/weak-password': 'Hasło jest za słabe.', 'auth/invalid-email': 'Niepoprawny e-mail.' };
    say($('userMsg'), m[err.code] || 'Nie udało się dodać użytkownika.', 'err');
  }
});

/* ---------- obecność (Realtime Database) ---------- */
let presence = {}, stops = [], unsubChat = null, chatOpen = false, unread = 0, chatFirst = true;
const myPres = () => ref(rtdb, 'presence/' + me.uid);
const myName = () => me.name || me.email;
function markOffline() {
  if (!me) return Promise.resolve();
  return set(myPres(), { name: myName(), online: false, lastSeen: rtTime() }).catch(() => {});
}
function startPresence() {
  const stopConn = onValue(ref(rtdb, '.info/connected'), s => {
    if (s.val() !== true) return;
    onDisconnect(myPres()).set({ name: myName(), online: false, lastSeen: rtTime() })
      .then(() => set(myPres(), { name: myName(), online: true, lastSeen: rtTime() }))
      .catch(e => console.warn(e));
  });
  const stopList = onValue(ref(rtdb, 'presence'), s => { presence = s.val() || {}; renderPresence(); }, e => console.warn(e));
  stops.push(stopConn, stopList);
}
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'przed chwilą';
  if (m < 60) return m + ' min temu';
  const h = Math.round(m / 60);
  return h < 24 ? h + ' godz. temu' : Math.round(h / 24) + ' dn. temu';
}
function renderPresence() {
  const all = Object.entries(presence).map(([uid, v]) => ({ uid, ...v }));
  const on = all.filter(u => u.online).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const off = all.filter(u => !u.online).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  $('fabOn').textContent = $('onN').textContent = on.length;
  const row = (u, isOn) => `<div class="pr ${isOn ? 'on' : ''}"><i></i>${esc(u.name)}${u.uid === me.uid ? ' (Ty)' : ''}${isOn ? '' : `<small>${u.lastSeen ? ago(u.lastSeen) : ''}</small>`}</div>`;
  $('whoList').innerHTML = `<div class="pr-h">Teraz online (${on.length})</div>` + (on.map(u => row(u, true)).join('') || '<div class="empty">Nikt.</div>') +
    (off.length ? `<div class="pr-h">Ostatnio aktywni</div>` + off.map(u => row(u, false)).join('') : '');
}
setInterval(() => { if (me && !$('chatPanel').hidden) renderPresence(); }, 30000);

/* ---------- czat (Firestore) ---------- */
const CHAT_TTL = 2 * 3600 * 1000;   // wiadomości żyją 2 godziny
let chatMsgs = [], chatTimer = null;
function renderChat() {
  const cutoff = Date.now() - CHAT_TTL;
  const list = chatMsgs.filter(m => { const t = m.createdAt?.toMillis?.(); return !t || t >= cutoff; });
  const html = list.map(m => {
    const mine = m.uid === me.uid;
    const t = m.createdAt?.toDate?.().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) || '…';
    return `<div class="cm ${mine ? 'me' : ''}"><small>${mine ? '' : esc(m.name) + ' · '}${t}</small><div class="mrow"><div class="b">${esc(m.text)}</div>${me.role === 'admin' && m.id ? `<button class="mdel" data-mid="${m.id}" aria-label="Usuń wiadomość" title="Usuń wiadomość">🗑</button>` : ''}</div></div>`;
  }).join('');
  $('chatMsgs').innerHTML = '<div class="cnote">🕒 Wiadomości znikają po 2 godzinach</div>' +
    (html || '<div class="empty">Brak wiadomości. Napisz pierwszą.</div>');
  $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
}
// Usuwa z bazy wiadomości starsze niż 2 h (reguły pozwalają na to każdemu aktywnemu użytkownikowi)
async function pruneChat() {
  try {
    const s = await getDocs(query(collection(db, 'chat'), where('createdAt', '<', Timestamp.fromMillis(Date.now() - CHAT_TTL)), limit(100)));
    s.docs.forEach(d => deleteDoc(d.ref).catch(() => {}));
  } catch (e) { console.warn(e); }
}
function startChat() {
  chatFirst = true; unread = 0; updBadge(); chatMsgs = [];
  const since = Timestamp.fromMillis(Date.now() - CHAT_TTL);
  const q = query(collection(db, 'chat'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(100));
  unsubChat = onSnapshot(q, snap => {
    if (!chatFirst && !chatOpen) {
      unread += snap.docChanges().filter(c => c.type === 'added' && c.doc.data().uid !== me.uid && !c.doc.metadata.hasPendingWrites).length;
      updBadge();
    }
    chatFirst = false;
    chatMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    renderChat();
  }, e => console.warn(e));
  pruneChat();
  chatTimer = setInterval(() => { renderChat(); if (Math.random() < 0.1) pruneChat(); }, 60000);
}
$('chatClear').onclick = async () => {
  if (!confirm('Usunąć wszystkie wiadomości czatu dla wszystkich?')) return;
  try {
    const s = await getDocs(collection(db, 'chat'));
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = writeBatch(db);
      s.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
  } catch (e) { console.warn(e); alert('Nie udało się wyczyścić czatu.'); }
};
function updBadge() { $('fabUnread').hidden = unread < 1; $('fabUnread').textContent = unread > 9 ? '9+' : unread; }
function stopRealtime() {
  stops.forEach(f => f()); stops = [];
  if (unsubChat) { unsubChat(); unsubChat = null; }
  if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
  presence = {}; chatOpen = false; $('chatPanel').hidden = true;
}
function setChatTab(t) {
  document.querySelectorAll('.ctabs button').forEach(b => b.classList.toggle('on', b.dataset.ct === t));
  $('chatMsgs').hidden = $('chatForm').hidden = t !== 'chat';
  $('whoList').hidden = t !== 'who';
  if (t === 'who') renderPresence(); else $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
}
$('chatFab').onclick = () => {
  chatOpen = $('chatPanel').hidden;
  $('chatPanel').hidden = !chatOpen;
  if (chatOpen) { unread = 0; updBadge(); setChatTab('chat'); if (isDesk()) $('chatInput').focus(); }
};
$('chatClose').onclick = () => { chatOpen = false; $('chatPanel').hidden = true; };
document.querySelector('.ctabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setChatTab(b.dataset.ct); });
$('chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('chatInput').value.trim(); if (!text) return;
  $('chatInput').value = '';
  try { await addDoc(collection(db, 'chat'), { text, uid: me.uid, name: myName(), createdAt: serverTimestamp() }); }
  catch { $('chatInput').value = text; alert('Nie udało się wysłać wiadomości.'); }
});

/* ---------- telefon: czat dopasowany do klawiatury ---------- */
if (window.visualViewport) {
  const setVV = () => {
    const v = window.visualViewport, st = document.documentElement.style;
    st.setProperty('--vvh', v.height + 'px');
    st.setProperty('--vvt', v.offsetTop + 'px');
    if (chatOpen) $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
  };
  window.visualViewport.addEventListener('resize', setVV);
  window.visualViewport.addEventListener('scroll', setVV);
  setVV();
}

/* ---------- admin: usuwanie pojedynczych wiadomości ---------- */
$('chatMsgs').addEventListener('click', async e => {
  const b = e.target.closest('.mdel'); if (!b || me?.role !== 'admin') return;
  b.disabled = true;
  try { await deleteDoc(doc(db, 'chat', b.dataset.mid)); }
  catch (err) { console.warn(err); b.disabled = false; alert('Nie udało się usunąć wiadomości.'); }
});

/* ---------- powiadomienia push (FCM) i przypominajki ---------- */
// Klucz VAPID: Firebase → Ustawienia projektu → Cloud Messaging → Web Push certificates → Generate key pair
const VAPID_KEY = 'BKu5CPaMR1kzu-Jcu5TC8ql0Z-nIOYIgQfd83xXHQax8-9sg1hIMJJBzRpm8KlpnOWrNQ5xzssZp3q0qCgoj8Q0';
let swReg = null;
async function getSW() {
  if (!swReg) swReg = await navigator.serviceWorker.register('firebase-messaging-sw.js', { scope: './' });
  await navigator.serviceWorker.ready;
  return swReg;
}
async function pushSupported() {
  return 'serviceWorker' in navigator && 'Notification' in window && await isSupported().catch(() => false);
}
async function fetchToken() {
  const reg = await getSW();
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}
async function saveToken(token) {
  if ((me.fcmTokens || []).includes(token)) return;
  await updateDoc(doc(db, 'users', me.uid), { fcmTokens: arrayUnion(token) });
  me.fcmTokens = [...(me.fcmTokens || []), token];
}
// po zalogowaniu cicho odświeża token, jeśli zgoda już została udzielona
async function refreshPushToken() {
  try { if (await pushSupported() && Notification.permission === 'granted') await saveToken(await fetchToken()); }
  catch (e) { console.warn('Token push:', e); }
}

$('remHour').innerHTML = Array.from({ length: 18 }, (_, i) => i + 6).map(h => `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`).join('');
async function fillSettings() {
  $('optPosts').checked = me.notifyPosts === true;
  $('optRem').checked = typeof me.reminderHour === 'number';
  $('remHour').value = typeof me.reminderHour === 'number' ? me.reminderHour : 20;
  say($('setMsg'), '');
  const ok = await pushSupported();
  if (!ok) say($('setInfo'), 'Ta przeglądarka nie obsługuje powiadomień. Użyj Chrome na Androidzie.', 'err');
  else if (Notification.permission === 'denied') say($('setInfo'), 'Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony.', 'err');
  else if (Notification.permission === 'granted' && (me.fcmTokens || []).length) say($('setInfo'), 'Powiadomienia są włączone na tym urządzeniu.', 'ok');
  else say($('setInfo'), 'Powiadomienia nie są jeszcze włączone na tym urządzeniu.');
  $('notifOn').hidden = !ok || (Notification.permission === 'granted' && (me.fcmTokens || []).length > 0);
}
$('setBtn').onclick = async () => { await fillSettings(); $('setDlg').showModal(); };
$('setClose').onclick = () => $('setDlg').close();
$('notifOn').onclick = async () => {
  say($('setInfo'), 'Włączam…');
  try {
    if (await Notification.requestPermission() !== 'granted') return say($('setInfo'), 'Nie udzielono zgody na powiadomienia.', 'err');
    await saveToken(await fetchToken());
    await updateDoc(doc(db, 'users', me.uid), { notifyPosts: true });
    me.notifyPosts = true;
    await fillSettings();
  } catch (e) {
    console.warn(e);
    say($('setInfo'), VAPID_KEY.startsWith('WKLEJ') ? 'Brak klucza VAPID w app.js.' : 'Nie udało się włączyć powiadomień.', 'err');
  }
};
$('setSave').onclick = async () => {
  const hour = $('optRem').checked ? Number($('remHour').value) : null;
  try {
    await updateDoc(doc(db, 'users', me.uid), { notifyPosts: $('optPosts').checked, reminderHour: hour });
    me.notifyPosts = $('optPosts').checked; me.reminderHour = hour;
    say($('setMsg'), (hour !== null || $('optPosts').checked) && !(me.fcmTokens || []).length
      ? 'Zapisano, ale najpierw włącz powiadomienia na tym urządzeniu.' : 'Zapisano.', 'ok');
  } catch (e) { console.warn(e); say($('setMsg'), 'Nie udało się zapisać.', 'err'); }
};
