// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
  apiKey: "AIzaSyASyxDOJ_pGwjBaQqThoYQRmWyq2sq6Eh0",
  authDomain: "report-55c9f.firebaseapp.com",
  databaseURL: "https://report-55c9f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "report-55c9f",
  storageBucket: "report-55c9f.firebasestorage.app",
  messagingSenderId: "104832186162",
  appId: "1:104832186162:web:de2428475f558f78b6c92b",
  measurementId: "G-JLZJWEMVBF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Realtime Database and get a reference to the service
export const database = getDatabase(app);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

export { app };
export default app;
