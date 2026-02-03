# Firebase Realtime Database Rules for Attendance

## Overview

This document describes the new data structure and security rules for the
attendance system.

## Data Structure

The new attendance structure is organized by date, with each date containing
homework information and student attendance records.

### Structure Example:

```json
{
  "datasheet": {
    "Điểm_danh": {
      "2025-11-10": {
        "homework": {
          "totalExercises": 5,
          "description": "Làm bài 1–5 trang 42",
          "assignedBy": "nguyensihoang@gmail.com"
        },
        "students": {
          "-NxAbCd12345": {
            "studentName": "Nguyễn Văn A",
            "present": true,
            "score": 9,
            "submittedBy": "nguyensihoang@gmail.com",
            "timestamp": "2025-11-10T06:10:21.210Z"
          },
          "-NxAbCd67890": {
            "studentName": "Trần Thị B",
            "present": true,
            "score": 8,
            "submittedBy": "nguyensihoang@gmail.com",
            "timestamp": "2025-11-10T06:10:21.210Z"
          }
        }
      },
      "2025-11-11": {
        "homework": {
          "totalExercises": 3,
          "description": "Review chapter 5",
          "assignedBy": "nguyensihoang@gmail.com"
        },
        "students": {
          "-NxAbCd12345": {
            "studentName": "Nguyễn Văn A",
            "present": false,
            "submittedBy": "nguyensihoang@gmail.com",
            "timestamp": "2025-11-11T06:10:21.210Z"
          }
        }
      }
    }
  }
}
```

## Security Rules

Copy and paste these rules into your Firebase Realtime Database Rules section in
the Firebase Console:

```json
{
  "rules": {
    "datasheet": {
      "Điểm_danh": {
        "$date": {
          ".read": "auth != null",
          "homework": {
            ".write": "auth != null && auth.token.role == 'teacher'"
          },
          "students": {
            "$studentId": {
              ".write": "auth != null && auth.token.role == 'teacher'"
            }
          }
        }
      },
      "Danh_sách_học_sinh": {
        ".read": "auth != null",
        "$studentId": {
          ".write": "auth != null && auth.token.role == 'teacher'"
        }
      },
      "Thời_khoá_biểu": {
        ".read": "auth != null",
        "$eventId": {
          ".write": "auth != null && auth.token.role == 'teacher'"
        }
      },
      "Gia_hạn": {
        ".read": "auth != null",
        "$extensionId": {
          ".write": "auth != null && auth.token.role == 'teacher'"
        }
      }
    }
  }
}
```

## Rule Explanation

### Authentication Requirements:

- **Read Access**: Only authenticated users (`auth != null`) can read data
- **Write Access**: Only users with `role == 'teacher'` can write data

### Protected Resources:

1. **homework**: Teachers can create/update homework information for each date
2. **students**: Teachers can record attendance and scores for students
3. **Danh_sách_học_sinh**: Student list - teachers can add/edit students
4. **Thời_khoá_biểu**: Schedule - teachers can manage schedules
5. **Gia_hạn**: Extensions - teachers can manage hour extensions

## Setting Custom Claims (User Roles)

To set the `role` custom claim for users, you need to use Firebase Admin SDK.
Here's a Node.js script example:

```javascript
const admin = require("firebase-admin");
const serviceAccount = require("./path/to/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://your-project.firebaseio.com",
});

// Set teacher role for a user
async function setTeacherRole(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role: "teacher" });
    console.log(`✅ Set teacher role for ${email}`);
  } catch (error) {
    console.error("Error setting custom claims:", error);
  }
}

// Example usage
setTeacherRole("nguyensihoang@gmail.com");
```

## How to Update Rules in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on "Realtime Database" in the left sidebar
4. Click on the "Rules" tab
5. Replace the existing rules with the rules provided above
6. Click "Publish"

## Testing the Rules

After updating the rules, test that:

1. ✅ Unauthenticated users **cannot** read or write data
2. ✅ Authenticated users **can** read data
3. ✅ Only teachers **can** write attendance, homework, and student data
4. ✅ Non-teacher users **cannot** write data (if you have student accounts)

## Migration from Old Structure

If you have existing attendance data in the old format, you'll need to migrate
it. Here's a migration script example:

```javascript
// This is a one-time migration script
async function migrateAttendanceData() {
  const oldAttendanceRef = admin.database().ref("datasheet/Điểm_danh");
  const snapshot = await oldAttendanceRef.once("value");
  const oldData = snapshot.val();

  if (!oldData) return;

  // Group by date
  const groupedByDate = {};

  Object.entries(oldData).forEach(([id, record]) => {
    const date = record.date;
    if (!groupedByDate[date]) {
      groupedByDate[date] = {
        homework: {
          totalExercises: 0,
          description: "",
          assignedBy: record.submittedBy || "Unknown",
        },
        students: {},
      };
    }

    groupedByDate[date].students[record.studentId] = {
      studentName: record.studentName,
      present: record.present,
      score: record.score || 0,
      submittedBy: record.submittedBy,
      timestamp: record.timestamp,
    };
  });

  // Write new structure
  await oldAttendanceRef.remove(); // Clear old data
  await oldAttendanceRef.set(groupedByDate);

  console.log("✅ Migration completed");
}
```

## Benefits of New Structure

1. **Better Organization**: Data grouped by date makes queries more efficient
2. **Homework Integration**: Homework information stored alongside attendance
3. **Atomic Updates**: Update entire day's data in one operation
4. **Better Security**: Fine-grained access control at the date level
5. **Scalability**: More efficient queries when filtering by date range
6. **Score Tracking**: Each student can have a score for the day

## API Usage in Code

The updated `AttendanceView.tsx` now:

- Saves data under `/datasheet/Điểm_danh/{date}` node
- Includes authentication token in all write operations
- Structures data with `homework` and `students` sub-nodes
- Allows teachers to enter homework details and student scores

## Notes

- Make sure all teacher accounts have the `role: 'teacher'` custom claim set
- The timestamp should be in ISO 8601 format
- Scores are optional and can be 0-10
- The `present` field is boolean (true/false)
- Student IDs should match the IDs in `Danh_sách_học_sinh`
