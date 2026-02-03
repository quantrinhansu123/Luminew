import { useNavigate } from 'react-router-dom';

export const useAppNavigation = () => {
  const navigate = useNavigate();

  return {
    navigateToLanding: () => navigate('/'),
    navigateToSchedule: () => navigate('/schedule'),
    navigateToStudents: () => navigate('/students'),
    navigateToTeachers: () => navigate('/teachers'),
    navigateToAdminCalendar: () => navigate('/admin-calendar'),
    navigateToAttendance: () => navigate('/attendance'),
  };
};
