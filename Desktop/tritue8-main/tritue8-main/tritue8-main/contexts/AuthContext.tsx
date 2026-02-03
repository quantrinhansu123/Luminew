import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, DATABASE_URL_BASE } from "../firebase";
import { UserProfile, UserRole } from "../types";
import { isAdmin } from "../config/admins";

const USERS_URL = `${DATABASE_URL_BASE}/datasheet/Users.json`;
const TEACHERS_URL = `${DATABASE_URL_BASE}/datasheet/Gi%C3%A1o_vi%C3%AAn.json`;
const STUDENTS_URL = `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh.json`;

// Session storage keys
const STORAGE_KEYS = {
  CURRENT_USER: "tritue8_current_user",
  USER_PROFILE: "tritue8_user_profile",
  NEEDS_ONBOARDING: "tritue8_needs_onboarding",
  AUTH_PERSISTENCE: "tritue8_auth_persistence",
} as const;

// Helper functions for local storage (changed from session storage)
const saveToStorage = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("⚠️ Failed to save to local storage:", error);
  }
};

const loadFromStorage = <T,>(key: string): T | null => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.warn("⚠️ Failed to load from local storage:", error);
    return null;
  }
};

const clearStorage = () => {
  try {
    Object.values(STORAGE_KEYS).forEach((key) =>
      localStorage.removeItem(key)
    );
  } catch (error) {
    console.warn("⚠️ Failed to clear local storage:", error);
  }
};

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  needsOnboarding: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithTeacherCredentials: (
    email: string,
    password: string
  ) => Promise<void>;
  signInWithParentCredentials: (
    studentCode: string,
    password: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: (fullName: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // Don't load User object from localStorage - it's not serializable
    // Instead, we'll rely on userProfile and onAuthStateChanged
    return null;
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    // Initialize from local storage
    return loadFromStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE);
  });
  const [needsOnboarding, setNeedsOnboarding] = useState(() => {
    // Initialize from local storage
    return loadFromStorage<boolean>(STORAGE_KEYS.NEEDS_ONBOARDING) || false;
  });
  const [loading, setLoading] = useState(() => {
    const storedProfile = loadFromStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE);
    return !storedProfile; // If we have a stored profile, we don't need to wait for onAuthStateChanged
  });

  // Fetch or create user profile
  const fetchUserProfile = async (user: User): Promise<UserProfile | null> => {
    try {
      const response = await fetch(USERS_URL);
      const data = await response.json();
      console.log(data, "000000000000");
      // Find existing user profile
      let profile: UserProfile | null = null;
      if (data) {
        const existingProfile = Object.entries(data).find(
          ([_, profile]: [string, any]) => profile.email === user.email
        );

        if (existingProfile) {
          const [id, profileData] = existingProfile;
          profile = { ...(profileData as UserProfile), uid: id };
        }
      }

      // Create new user profile if not exists
      if (!profile) {
        const role: UserRole = isAdmin(user.email) ? "admin" : "teacher";
        const newProfile: Omit<UserProfile, "uid"> = {
          email: user.email!,
          role,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        console.log("📝 Creating new user profile:", {
          email: user.email,
          role,
        });

        const createResponse = await fetch(USERS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newProfile),
        });

        if (createResponse.ok) {
          const result = await createResponse.json();
          profile = { ...newProfile, uid: result.name };
        } else {
          return null;
        }
      }

      // Fetch teacher position from Giáo_viên table
      try {
        const teachersResponse = await fetch(TEACHERS_URL);
        const teachersData = await teachersResponse.json();

        if (teachersData) {
          const teacherEntry = Object.entries(teachersData).find(
            ([_, teacher]: [string, any]) =>
              teacher.Email === user.email ||
              teacher["Email công ty"] === user.email
          );

          if (teacherEntry) {
            console.log(teacherEntry, "sfsfdsdfdsfsbb");
            const [teacherId, teacherData]: [string, any] = teacherEntry;
            const position = teacherData["Vị trí"] || "";

            // Check admin status: either by position OR by email in admin list
            const isAdminByPosition = position === "Admin";
            const isAdminByEmail = isAdmin(user.email); // Using the function from config/admins.ts
            const finalIsAdmin = isAdminByPosition || isAdminByEmail;

            // Update profile with position info
            profile = {
              ...profile,
              teacherId,
              position,
              isAdmin: finalIsAdmin,
            };

            console.log("✅ User profile loaded with position:", {
              email: user.email,
              position: position,
              isAdminByPosition: isAdminByPosition,
              isAdminByEmail: isAdminByEmail,
              finalIsAdmin: finalIsAdmin,
              teacherId: teacherId,
              fullTeacherData: teacherData,
            });
          } else {
            // If no teacher entry found, fallback to email-based admin check
            const isAdminByEmail = isAdmin(user.email);
            profile = {
              ...profile,
              isAdmin: isAdminByEmail,
            };
            console.log(
              "⚠️ No teacher entry found, using email-based admin check:",
              { email: user.email, isAdmin: isAdminByEmail }
            );
          }
        }
      } catch (error) {
        console.warn("⚠️ Could not fetch teacher position:", error);
      }

      return profile;
    } catch (error) {
      console.error("❌ Error fetching user profile:", error);
      return null;
    }
  };

  useEffect(() => {
    let isSubscribed = true;

    // Mark auth persistence in storage
    saveToStorage(STORAGE_KEYS.AUTH_PERSISTENCE, true);

    // Restore currentUser from userProfile if available (for teacher/parent auth)
    const storedProfile = loadFromStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE);
    if (storedProfile && !currentUser) {
      // Create minimal user object from profile
      const restoredUser = {
        uid: storedProfile.uid,
        email: storedProfile.email,
        emailVerified: true,
        displayName: storedProfile.displayName || undefined,
      } as User;
      setCurrentUser(restoredUser);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isSubscribed) return;

      console.log('🔐 Auth state changed:', { user: user?.email || 'null', uid: user?.uid || 'null' });
      
      setCurrentUser(user);
      // Don't save User object to localStorage - it's not serializable
      // saveToStorage(STORAGE_KEYS.CURRENT_USER, user);

      if (user) {
        console.log("👤 User logged in:", user.email);
        try {
          const profile = await fetchUserProfile(user);
          if (!isSubscribed) return;

          setUserProfile(profile);
          saveToStorage(STORAGE_KEYS.USER_PROFILE, profile);

          // Check if teacher needs onboarding
          if (profile && profile.role === "teacher" && !profile.teacherId) {
            console.log("🎓 Teacher needs onboarding");
            setNeedsOnboarding(true);
            saveToStorage(STORAGE_KEYS.NEEDS_ONBOARDING, true);
          } else {
            setNeedsOnboarding(false);
            saveToStorage(STORAGE_KEYS.NEEDS_ONBOARDING, false);
          }
        } catch (error) {
          console.error("❌ Error loading user profile:", error);
          setUserProfile(null);
          setNeedsOnboarding(false);
          saveToStorage(STORAGE_KEYS.USER_PROFILE, null);
          saveToStorage(STORAGE_KEYS.NEEDS_ONBOARDING, false);
        }
      } else {
        console.log("👤 User logged out");
        setUserProfile(null);
        setNeedsOnboarding(false);
        // Only clear storage if this is an intentional logout, not a page refresh
        const authPersistence = loadFromStorage<boolean>(STORAGE_KEYS.AUTH_PERSISTENCE);
        if (!authPersistence) {
          clearStorage();
        }
      }

      if (isSubscribed) {
        setLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      console.log("📝 Creating account with email:", email);

      // Create user account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Send email verification
      await sendEmailVerification(userCredential.user);

      console.log("✅ Account created. Verification email sent to:", email);
    } catch (error) {
      console.error("❌ Error creating account:", error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      console.log("� Signing in with email:", email);

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Check if email is verified
      if (!userCredential.user.emailVerified) {
        console.warn("⚠️ Email not verified");
        // You can choose to allow or block unverified users
        // For now, we'll allow but show a warning
      }

      console.log("✅ Sign in successful");
    } catch (error) {
      console.error("❌ Error signing in:", error);
      throw error;
    }
  };

  const signInWithTeacherCredentials = async (
    email: string,
    password: string
  ) => {
    try {
      console.log("🏫 Signing in with teacher credentials:", email);

      // Fetch teachers from Firebase
      const response = await fetch(TEACHERS_URL);
      if (!response.ok) {
        throw new Error("Failed to fetch teachers data");
      }

      const teachersData = await response.json();
      if (!teachersData) {
        throw new Error("No teachers found");
      }

      // Find teacher by email and password
      const teacherEntry = Object.entries(teachersData).find(
        ([id, teacher]: [string, any]) => {
          const teacherEmail =
            teacher?.["Email"] || teacher?.["Email công ty"] || "";
          const teacherPassword = teacher?.["Password"] || "";
          return (
            teacherEmail.toLowerCase() === email.toLowerCase() &&
            teacherPassword === password
          );
        }
      );

      if (!teacherEntry) {
        throw new Error("Invalid email or password");
      }

      const [teacherId, teacherData] = teacherEntry as [string, any];

      // Create a mock user object for teacher login
      const mockUser = {
        uid: teacherId,
        email: teacherData["Email"] || teacherData["Email công ty"],
        emailVerified: true,
        displayName: teacherData["Họ và tên"],
      } as User;

      // Create user profile
      const profile: UserProfile = {
        uid: mockUser.uid,
        email: mockUser.email!,
        displayName: teacherData["Họ và tên"],
        role: teacherData["Vị trí"] === "Admin" ? "admin" : "teacher",
        isAdmin: teacherData["Vị trí"] === "Admin" || isAdmin(mockUser.email!),
        createdAt: new Date().toISOString(),
      };

      // Set the current user and profile directly (bypassing Firebase Auth)
      setCurrentUser(mockUser);
      setUserProfile(profile);
      setNeedsOnboarding(false);

      // Save to local storage
      saveToStorage(STORAGE_KEYS.CURRENT_USER, mockUser);
      saveToStorage(STORAGE_KEYS.USER_PROFILE, profile);
      saveToStorage(STORAGE_KEYS.NEEDS_ONBOARDING, false);

      console.log("✅ Teacher sign in successful:", profile);
    } catch (error) {
      console.error("❌ Error signing in with teacher credentials:", error);
      throw error;
    }
  };

  const signInWithParentCredentials = async (
    studentCode: string,
    password: string
  ) => {
    try {
      console.log("👨‍👩‍👧 Signing in with parent credentials:", studentCode);

      // Fetch students from Firebase
      const response = await fetch(STUDENTS_URL);
      if (!response.ok) {
        throw new Error("Failed to fetch students data");
      }

      const studentsData = await response.json();
      if (!studentsData) {
        throw new Error("No students found");
      }

      // Find student by student code and password
      const studentEntry = Object.entries(studentsData).find(
        ([id, student]: [string, any]) => {
          const code = student?.["Mã học sinh"] || "";
          const pwd = student?.["Mật khẩu"] || "";
          return (
            code.toLowerCase() === studentCode.toLowerCase() &&
            pwd === password
          );
        }
      );

      if (!studentEntry) {
        throw new Error("Mã học sinh hoặc mật khẩu không đúng");
      }

      const [studentId, studentData] = studentEntry as [string, any];

      // Check if password is set
      if (!studentData["Mật khẩu"]) {
        throw new Error("Tài khoản chưa được kích hoạt. Vui lòng liên hệ nhà trường.");
      }

      // Check if student status is "Hủy" (cancelled)
      if (studentData["Trạng thái"] === "Hủy") {
        throw new Error("Tài khoản học sinh đã bị hủy. Vui lòng liên hệ với trung tâm để biết thêm chi tiết.");
      }

      // Create a mock user object for parent login
      const mockUser = {
        uid: `parent_${studentId}`,
        email: studentData["Email"] || `${studentCode}@parent.local`,
        emailVerified: true,
        displayName: `Phụ huynh ${studentData["Họ và tên"]}`,
      } as User;

      // Create user profile for parent
      const profile: UserProfile = {
        uid: mockUser.uid,
        email: mockUser.email!,
        displayName: mockUser.displayName!,
        role: "parent" as UserRole,
        studentId: studentId,
        studentName: studentData["Họ và tên"],
        studentCode: studentData["Mã học sinh"],
        isAdmin: false,
        createdAt: new Date().toISOString(),
      };

      // Set the current user and profile directly
      setCurrentUser(mockUser);
      setUserProfile(profile);
      setNeedsOnboarding(false);

      // Save to local storage
      saveToStorage(STORAGE_KEYS.CURRENT_USER, mockUser);
      saveToStorage(STORAGE_KEYS.USER_PROFILE, profile);
      saveToStorage(STORAGE_KEYS.NEEDS_ONBOARDING, false);

      console.log("✅ Parent sign in successful:", profile);
    } catch (error) {
      console.error("❌ Error signing in with parent credentials:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      console.log("🚪 Signing out");
      
      // Clear local state first (for teacher authentication)
      setCurrentUser(null);
      setUserProfile(null);
      setNeedsOnboarding(false);

      // Mark as intentional logout before clearing storage
      localStorage.removeItem(STORAGE_KEYS.AUTH_PERSISTENCE);
      clearStorage();

      // Try Firebase signOut (for legacy users)
      try {
        await firebaseSignOut(auth);
      } catch (firebaseError) {
        // Ignore Firebase errors for teacher authentication
        console.log("💡 Firebase signOut skipped (teacher authentication)");
      }

      console.log("👋 Logged out");
    } catch (error) {
      console.error("❌ Logout error:", error);
      throw error;
    }
  };

  const completeOnboarding = async (fullName: string) => {
    if (!currentUser || !userProfile) {
      throw new Error("No user logged in");
    }

    try {
      console.log("🎓 Starting teacher onboarding:", {
        fullName,
        email: currentUser.email,
      });

      // 1. Create teacher record in Giáo_viên
      const teacherData = {
        "Họ và tên": fullName,
        Email: currentUser.email,
        "Biên chế": "Mới",
        "Ngày tạo": new Date().toISOString(),
      };

      const teacherResponse = await fetch(TEACHERS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teacherData),
      });

      if (!teacherResponse.ok) {
        throw new Error("Failed to create teacher record");
      }

      const teacherResult = await teacherResponse.json();
      const teacherId = teacherResult.name;
      console.log("✅ Teacher record created:", teacherId);

      // 2. Update user profile with teacherId
      const userUpdateUrl = `${DATABASE_URL_BASE}/Users/${userProfile.uid}.json`;
      const updateResponse = await fetch(userUpdateUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId,
          updatedAt: new Date().toISOString(),
        }),
      });

      if (!updateResponse.ok) {
        throw new Error("Failed to update user profile");
      }

      console.log("✅ User profile updated with teacherId");

      // 3. Update local state
      setUserProfile({
        ...userProfile,
        teacherId,
        updatedAt: new Date().toISOString(),
      });
      setNeedsOnboarding(false);

      // Save to session storage
      const updatedProfile = {
        ...userProfile,
        teacherId,
        updatedAt: new Date().toISOString(),
      };
      saveToStorage(STORAGE_KEYS.USER_PROFILE, updatedProfile);
      saveToStorage(STORAGE_KEYS.NEEDS_ONBOARDING, false);

      console.log("🎉 Onboarding completed successfully");
    } catch (error) {
      console.error("❌ Onboarding error:", error);
      throw error;
    }
  };

  const value: AuthContextType = {
    currentUser,
    userProfile,
    loading,
    needsOnboarding,
    signUpWithEmail,
    signInWithEmail,
    signInWithTeacherCredentials,
    signInWithParentCredentials,
    signOut,
    completeOnboarding,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
