import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { UserProfile } from '../models/user.model';

const USER_STORAGE_KEY = 'tcg_auth_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private firebaseApp: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private isFirebaseConfigured = false;

  private currentUserSignal = signal<UserProfile | null>(this.getInitialUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.currentUserSignal()));

  constructor(private router: Router) {
    this.initFirebase();
  }

  private initFirebase(): void {
    const isPlaceholder =
      !environment.firebase.apiKey ||
      environment.firebase.apiKey.includes('YOUR_FIREBASE_API_KEY');

    if (!isPlaceholder) {
      try {
        if (!getApps().length) {
          this.firebaseApp = initializeApp(environment.firebase);
        } else {
          this.firebaseApp = getApps()[0];
        }
        this.auth = getAuth(this.firebaseApp);
        this.isFirebaseConfigured = true;

        // Listen to Auth State changes in Firebase
        onAuthStateChanged(this.auth, (user: User | null) => {
          if (user) {
            const profile: UserProfile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email?.split('@')[0] || 'QA Engineer',
              role: 'QA Automation Lead',
              photoURL: user.photoURL
            };
            this.setCurrentUser(profile);
          } else if (!this.hasLocalSession()) {
            this.setCurrentUser(null);
          }
        });
      } catch (err) {
        console.warn('Firebase initialization warning (using local session fallback):', err);
        this.isFirebaseConfigured = false;
      }
    } else {
      this.isFirebaseConfigured = false;
    }
  }

  private getInitialUser(): UserProfile | null {
    try {
      const saved = localStorage.getItem(USER_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not read user from storage', e);
    }
    return null;
  }

  private hasLocalSession(): boolean {
    return Boolean(localStorage.getItem(USER_STORAGE_KEY));
  }

  private setCurrentUser(user: UserProfile | null): void {
    this.currentUserSignal.set(user);
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }

  async login(email: string, password: string, remember: boolean = true): Promise<UserProfile> {
    if (!email || !password) {
      throw new Error('Debes ingresar un correo y contraseña válidos.');
    }

    // Real Firebase Auth flow
    if (this.isFirebaseConfigured && this.auth) {
      try {
        const cred = await signInWithEmailAndPassword(this.auth, email, password);
        const profile: UserProfile = {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName || email.split('@')[0] || 'QA Engineer',
          role: 'Senior QA Specialist',
          photoURL: cred.user.photoURL
        };
        this.setCurrentUser(profile);
        return profile;
      } catch (err: any) {
        let message = 'Error de autenticación con Firebase.';
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
          message = 'Credenciales inválidas. Verifica tu correo y contraseña.';
        } else if (err.code === 'auth/user-not-found') {
          message = 'No existe una cuenta registrada con este correo.';
        } else if (err.code === 'auth/too-many-requests') {
          message = 'Demasiados intentos fallidos. Intenta más tarde.';
        } else if (err.message) {
          message = err.message;
        }
        throw new Error(message);
      }
    }

    // Local / Dev Fallback mode when Firebase keys are not yet configured in environment.ts
    const sanitizedEmail = email.trim().toLowerCase();
    const displayName = sanitizedEmail.split('@')[0];
    const formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

    const devProfile: UserProfile = {
      uid: 'dev-user-' + Math.random().toString(36).substring(2, 9),
      email: sanitizedEmail,
      displayName: formattedName || 'QA Lead Specialist',
      role: 'QA Automation Lead'
    };

    this.setCurrentUser(devProfile);
    return devProfile;
  }

  async logout(): Promise<void> {
    if (this.isFirebaseConfigured && this.auth) {
      try {
        await signOut(this.auth);
      } catch (e) {
        console.warn('Error during Firebase signOut:', e);
      }
    }
    this.setCurrentUser(null);
    this.router.navigate(['/login']);
  }

  getCurrentUser(): UserProfile | null {
    return this.currentUserSignal();
  }

  isConfiguredWithFirebase(): boolean {
    return this.isFirebaseConfigured;
  }
}
