// Firebase Realtime Database only (Auth không bật trên project → tránh getProjectConfig 400 / iframe.js).
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyASyxDOJ_pGwjBaQqThoYQRmWyq2sq6Eh0',
  authDomain: 'report-55c9f.firebaseapp.com',
  databaseURL: 'https://report-55c9f-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'report-55c9f',
  storageBucket: 'report-55c9f.firebasestorage.app',
  messagingSenderId: '104832186162',
  appId: '1:104832186162:web:de2428475f558f78b6c92b',
  measurementId: 'G-JLZJWEMVBF',
};

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);

export { app };
export default app;
