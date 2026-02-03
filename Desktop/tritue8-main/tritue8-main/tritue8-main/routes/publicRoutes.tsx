import HomePage from "@/components/pages/HomePage";
import Login from "@/components/pages/Login";
import NotFoundPage from "@/components/pages/NotFoundPage";
import TeacherOnboarding from "@/components/TeacherOnboarding";
import ParentPortal from "@/components/pages/ParentPortal";
import MainLayout from "@/layouts/MainLayout";
import { Empty } from "antd";
import { Navigate } from "react-router-dom";

const publicRoutes = [
  {
    path: "/",
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "about",
        element: <Empty />,
      },
      {
        path: "courses",
        element: <Empty />,
      },
      {
        path: "contact",
        element: <Empty />,
      },
    ],
  },
  {
    path: "login",
    element: <Login />,
  },
  {
    path: "onboarding",
    element: <TeacherOnboarding />,
  },
  {
    path: "parent-portal",
    element: <ParentPortal />,
  },

  {
    path: "*",
    element: <Navigate to={"/404"} />,
  },
  {
    path: "/404",
    element: <NotFoundPage />,
  },
];

export default publicRoutes;
