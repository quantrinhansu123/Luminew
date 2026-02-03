import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import { AttendanceSession } from '../types';
import dayjs from 'dayjs';

interface StudentStats {
    totalSessions: number; // Tổng số buổi học
    totalHours: number; // Tổng số giờ học
    presentSessions: number; // Số buổi có mặt
    absentSessions: number; // Số buổi vắng
}

interface TeacherStats {
    totalSessions: number; // Tổng số buổi dạy
    totalHours: number; // Tổng số giờ dạy
    totalClasses: number; // Số lớp đang dạy
}

export const useAttendanceStats = () => {
    const [sessions, setSessions] = useState<AttendanceSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const sessionsRef = ref(database, 'datasheet/Điểm_danh_sessions');
        const unsubscribe = onValue(sessionsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const sessionsList = Object.entries(data).map(([id, value]) => ({
                    id,
                    ...(value as Omit<AttendanceSession, 'id'>)
                }));
                setSessions(sessionsList);
            } else {
                setSessions([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Calculate student stats
    const getStudentStats = (studentId: string): StudentStats => {
        const studentSessions = sessions.filter(session => 
            session['Điểm danh']?.some(record => record['Student ID'] === studentId)
        );

        let totalHours = 0;
        let presentSessions = 0;
        let absentSessions = 0;

        studentSessions.forEach(session => {
            const record = session['Điểm danh']?.find(r => r['Student ID'] === studentId);
            if (record) {
                // Calculate hours
                const startTime = dayjs(`2000-01-01 ${session['Giờ bắt đầu']}`);
                const endTime = dayjs(`2000-01-01 ${session['Giờ kết thúc']}`);
                const hours = endTime.diff(startTime, 'hour', true);
                
                if (record['Có mặt']) {
                    totalHours += hours;
                    presentSessions++;
                } else {
                    absentSessions++;
                }
            }
        });

        return {
            totalSessions: studentSessions.length,
            totalHours: Math.round(totalHours * 10) / 10,
            presentSessions,
            absentSessions
        };
    };

    // Calculate teacher stats
    const getTeacherStats = (teacherId: string): TeacherStats => {
        const teacherSessions = sessions.filter(session => 
            session['Teacher ID'] === teacherId
        );

        let totalHours = 0;
        const uniqueClasses = new Set<string>();

        teacherSessions.forEach(session => {
            // Calculate hours
            const startTime = dayjs(`2000-01-01 ${session['Giờ bắt đầu']}`);
            const endTime = dayjs(`2000-01-01 ${session['Giờ kết thúc']}`);
            const hours = endTime.diff(startTime, 'hour', true);
            totalHours += hours;

            // Track unique classes
            if (session['Class ID']) {
                uniqueClasses.add(session['Class ID']);
            }
        });

        return {
            totalSessions: teacherSessions.length,
            totalHours: Math.round(totalHours * 10) / 10,
            totalClasses: uniqueClasses.size
        };
    };

    return {
        loading,
        sessions,
        getStudentStats,
        getTeacherStats
    };
};
