/* Service worker: odbiera powiadomienia push, gdy strona jest zamknięta.
   Musi leżeć w tym samym folderze co index.html. */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCSfbYa7cUIjgF01XcUCnOrY5mmusnRLdE",
  authDomain: "bible-12cc4.firebaseapp.com",
  projectId: "bible-12cc4",
  messagingSenderId: "847997174570",
  appId: "1:847997174570:web:4f45b9936519b540b21453"
});
firebase.messaging(); // powiadomienia z treścią wyświetla system; kliknięcie otwiera link z wiadomości

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // wymagane przez Chrome do instalacji aplikacji
