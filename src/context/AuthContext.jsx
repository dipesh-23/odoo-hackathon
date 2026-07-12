import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../firebase";
import { createUserProfile, getUserProfile } from "../services/userService";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Signup: creates Firebase Auth account + Firestore users/{uid} doc
   * with role = "Employee" (enforced by Security Rules too).
   *
   * @param {string} email
   * @param {string} password
   * @param {string} name - display name for the user profile
   */
  async function signup(email, password, name = "") {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Create the Firestore user profile document
    await createUserProfile(cred.user.uid, {
      name,
      email,
      departmentId: null,
      departmentName: null,
    });

    // Load the profile immediately
    const profile = await getUserProfile(cred.user.uid);
    setUserProfile(profile);

    return cred;
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    // Load the Firestore user profile
    const profile = await getUserProfile(cred.user.uid);
    setUserProfile(profile);

    return cred;
  }

  async function logout() {
    setUserProfile(null);
    return signOut(auth);
  }

  function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  /**
   * Reload the user profile from Firestore.
   * Useful after role changes or profile updates.
   */
  async function refreshProfile() {
    if (currentUser) {
      const profile = await getUserProfile(currentUser.uid);
      setUserProfile(profile);
      return profile;
    }
    return null;
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        // Load profile on auth state change (e.g. page refresh with existing session)
        try {
          const profile = await getUserProfile(user.uid);
          setUserProfile(profile);
        } catch (err) {
          console.warn("Failed to load user profile:", err);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    signup,
    login,
    logout,
    resetPassword,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
