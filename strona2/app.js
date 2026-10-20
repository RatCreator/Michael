import {initializeApp} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,createUserWithEmailAndPassword,sendPasswordResetEmail}
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,updateDoc,deleteDoc,addDoc,collection,query,orderBy,limit,onSnapshot,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSfbYa7cUIjgF01XcUCnOrY5mmusnRLdE",
  authDomain: "bible-12cc4.firebaseapp.com",
  projectId: "bible-12cc4",
  storageBucket: "bible-12cc4.firebasestorage.app",
  messagingSenderId: "847997174570",
  appId: "1:847997174570:web:4f45b9936519b540b21453"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
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
$('logoutBtn').onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
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
  $('adminTabBtn').hidden = me.role !== 'admin';
  $('loginPass').value = '';
  say($('loginMsg'), '');
  startPosts();
  if (me.role === 'admin') startUsers();
  showTab('browse');
});

/* ---------- zakładki ---------- */
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== 'tab-' + name);
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  window.scrollTo(0, 0);
}
$('nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });

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
        ${u.id === me.uid ? '<small>to Ty</small>' : `
          <button data-act="active" data-id="${u.id}">${u.active ? 'Zablokuj' : 'Odblokuj'}</button>
          <button data-act="role" data-id="${u.id}">${u.role === 'admin' ? 'Odbierz admina' : 'Nadaj admina'}</button>
          <button data-act="reset" data-id="${u.id}" data-email="${esc(u.email)}">Reset hasła</button>
          <button class="red" data-act="del" data-id="${u.id}">Usuń</button>`}
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
